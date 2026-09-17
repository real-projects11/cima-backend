import { redis } from './redis';
import { STARTS, INCREMENTS, PROTECTION_HOURS, LOCK_MINUTES, minToDisplace, round2, uniqueAmount } from './pricing';

const SLOTS = [1, 2, 3, 4, 5];
const posKey = (slot) => `position:${slot}`;
const lockKey = (slot) => `lock:${slot}`;
const queueKey = (slot) => `queue:${slot}`;
const STATS_TOTAL_KEY = 'stats:totalPublished';

// Historial de "desplazados": quienes tenían un puesto y otro pagó más para
// sacarlos. Se guarda cada entrada en un hash (por id) + el orden en una
// lista aparte, para poder borrar una puntual sin tener que reescribir todo.
const DISPLACED_ITEMS_KEY = 'displaced:items';
const DISPLACED_ORDER_KEY = 'displaced:order';

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Lee un puesto + calcula los campos derivados (protegido, horas restantes, mínimo para desplazar) */
export async function getPosition(slot) {
  const [pos, lock] = await Promise.all([redis.hgetall(posKey(slot)), redis.hgetall(lockKey(slot))]);

  const hasOccupant = pos && pos.name;
  const now = Date.now();
  const protectedIndefinite = hasOccupant && pos.protectedIndefinite === '1';
  const protectedUntil = hasOccupant ? Number(pos.protectedUntil || 0) : 0;
  // Ojo: Infinity no sobrevive un JSON.stringify (queda null), así que si la
  // protección es indefinida mandamos 0 acá y el frontend se guía por el
  // flag protectedIndefinite, no por este número.
  const protectedHoursLeft = hasOccupant
    ? (protectedIndefinite ? 0 : Math.max(0, (protectedUntil - now) / 3_600_000))
    : 0;

  const lockActive =
    lock && lock.status && (lock.status === 'awaiting_confirmation' || (lock.lockExpiresAt && Number(lock.lockExpiresAt) > now));

  return {
    rank: slot,
    occupied: !!hasOccupant,
    name: pos?.name || null,
    desc: pos?.desc || null,
    platform: pos?.platform || null,
    url: pos?.url || null,
    cta: pos?.cta || null,
    link: pos?.link || null,
    ticker: pos?.ticker || null,
    price: hasOccupant ? Number(pos.price) : null,
    paidAt: pos?.paidAt || null,
    protectedHoursLeft: round2(protectedHoursLeft),
    protectedIndefinite: !!protectedIndefinite,
    minToDisplace: hasOccupant ? minToDisplace({ rank: slot, price: Number(pos.price) }) : STARTS[slot],
    startPrice: STARTS[slot],
    increment: INCREMENTS[slot],
    locked: !!lockActive,
    lockStatus: lockActive ? lock.status : null,
  };
}

export async function getAllPositions() {
  // Limpieza perezosa: en vez de depender de un cron cada 1 min (que el plan
  // Hobby de Vercel no permite), liberamos locks vencidos acá mismo, cada vez
  // que alguien pide el estado de los puestos (carga de página / polling).
  await cleanupExpiredLocks();
  const [positions, totalPublished] = await Promise.all([
    Promise.all(SLOTS.map(getPosition)),
    getTotalPublished(),
  ]);
  return { positions, totalPublished };
}

/** Contador real de publicaciones confirmadas históricamente (arranca en 0, nada inventado) */
export async function getTotalPublished() {
  const v = await redis.get(STATS_TOTAL_KEY);
  return Number(v) || 0;
}

/**
 * Intenta reservar un puesto. Si está libre, crea el lock con TTL de LOCK_MINUTES.
 * Si está tomado, encola al usuario (FIFO) y devuelve su lugar en la cola.
 */
export async function reservePosition(slot, { platform, handle, title, desc, btnText, contact, bid: requestedBid, link, ticker }) {
  if (!SLOTS.includes(Number(slot))) throw new Error('slot inválido');

  const [pos, lock] = await Promise.all([redis.hgetall(posKey(slot)), redis.hgetall(lockKey(slot))]);
  const now = Date.now();
  const lockActive = lock && lock.status && (lock.status === 'awaiting_confirmation' || Number(lock.lockExpiresAt) > now);

  // El mínimo real siempre se calcula acá, server-side — el cliente no puede pagar menos
  // aunque manipule el request. Si mandó una oferta más alta, se respeta esa.
  const floor = pos && pos.name ? minToDisplace({ rank: slot, price: Number(pos.price) }) : STARTS[slot];
  const bid = requestedBid && Number(requestedBid) >= floor ? round2(Number(requestedBid)) : floor;

  if (lockActive) {
    const reservationId = newId();
    const entry = { reservationId, platform, handle, title, desc, btnText, contact, link, ticker, requestedAt: now, bid };
    await redis.rpush(queueKey(slot), JSON.stringify(entry));
    const queueLength = await redis.llen(queueKey(slot));
    return { status: 'queued', reservationId, queuePosition: queueLength };
  }

  const reservationId = newId();
  const amount = uniqueAmount(bid);
  const expiresAt = now + LOCK_MINUTES * 60_000;

  await redis.hset(lockKey(slot), {
    reservationId,
    status: 'locked',
    platform, handle, title, desc, btnText, contact, link, ticker,
    bid: String(bid),
    amount: String(amount),
    lockExpiresAt: String(expiresAt),
    createdAt: String(now),
  });
  await redis.expire(lockKey(slot), LOCK_MINUTES * 60 + 60); // colchón de 1 min por si el TTL de redis y nuestro chequeo desincronizan

  return { status: 'locked', reservationId, amount, bid, expiresAt };
}

/** El usuario avisa que ya pagó: se congela el lock (sin TTL) hasta que el admin confirme o rechace */
export async function markPaid(slot, reservationId) {
  const lock = await redis.hgetall(lockKey(slot));
  if (!lock || lock.reservationId !== reservationId) throw new Error('Reserva no encontrada o vencida');
  if (lock.status !== 'locked') throw new Error('Esta reserva ya no está esperando pago');

  await redis.hset(lockKey(slot), { status: 'awaiting_confirmation' });
  await redis.persist(lockKey(slot)); // saca el TTL, queda congelado sin límite de tiempo
  return { status: 'awaiting_confirmation' };
}

/** Admin confirma que vio el pago entrar a la wallet: publica el puesto y arranca las 48hs */
export async function confirmPayment(slot) {
  const lock = await redis.hgetall(lockKey(slot));
  if (!lock || lock.status !== 'awaiting_confirmation') {
    throw new Error('No hay una reserva esperando confirmación en este puesto');
  }

  const now = Date.now();

  // Si el puesto ya tenía a alguien, a ese alguien lo están desplazando ahora
  // mismo — lo mandamos al historial de "puestos desplazados" antes de pisar
  // sus datos con los del nuevo ocupante.
  const previous = await redis.hgetall(posKey(slot));
  if (previous && previous.name) {
    await archiveDisplaced(slot, previous, now);
  }

  await redis.hset(posKey(slot), {
    name: lock.title,
    desc: lock.desc,
    platform: lock.platform,
    url: lock.handle,
    link: lock.link,
    ticker: lock.ticker,
    cta: lock.btnText,
    price: lock.bid,
    paidAt: String(now),
    protectedUntil: String(now + PROTECTION_HOURS * 3_600_000),
    protectedIndefinite: '0',
    reservationId: lock.reservationId,
  });
  await redis.del(lockKey(slot));
  await redis.incr(STATS_TOTAL_KEY);

  await offerNextInQueue(slot);
  return { status: 'confirmed' };
}

/** Guarda el ocupante saliente de un puesto en el historial de desplazados */
async function archiveDisplaced(slot, previous, displacedAt) {
  const id = newId();
  const entry = {
    id,
    rank: Number(slot),
    name: previous.name,
    desc: previous.desc,
    platform: previous.platform,
    url: previous.url,
    link: previous.link || null,
    ticker: previous.ticker || null,
    cta: previous.cta,
    price: Number(previous.price),
    paidAt: previous.paidAt ? Number(previous.paidAt) : null,
    displacedAt,
  };
  await redis.hset(DISPLACED_ITEMS_KEY, { [id]: JSON.stringify(entry) });
  await redis.lpush(DISPLACED_ORDER_KEY, id);
  await redis.ltrim(DISPLACED_ORDER_KEY, 0, 99); // guardamos como máximo los últimos 100
}

/** Lista pública de puestos desplazados históricamente (para la sección de "más publicados") */
export async function getDisplacedList() {
  const ids = await redis.lrange(DISPLACED_ORDER_KEY, 0, 99);
  if (!ids || !ids.length) return [];
  const items = await redis.hmget(DISPLACED_ITEMS_KEY, ...ids);
  return ids
    .map((id) => {
      const raw = items ? items[id] : null;
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    })
    .filter(Boolean);
}

/** Admin: borra una entrada puntual del historial de desplazados */
export async function deleteDisplaced(id) {
  if (!id) throw new Error('Falta el id');
  await redis.hdel(DISPLACED_ITEMS_KEY, id);
  await redis.lrem(DISPLACED_ORDER_KEY, 0, id);
  return { status: 'deleted' };
}

/**
 * Admin: cambia el modo de protección de un puesto ocupado.
 *  - '48h'        → reinicia el contador a 48hs desde ahora.
 *  - 'indefinite' → protección sin límite de tiempo hasta que se desactive.
 *  - 'off'        → saca cualquier protección, queda desplazable ya mismo.
 */
export async function setProtection(slot, mode) {
  if (!SLOTS.includes(Number(slot))) throw new Error('slot inválido');
  const pos = await redis.hgetall(posKey(slot));
  if (!pos || !pos.name) throw new Error('Este puesto no tiene ocupante');

  const now = Date.now();
  if (mode === '48h') {
    await redis.hset(posKey(slot), { protectedUntil: String(now + PROTECTION_HOURS * 3_600_000), protectedIndefinite: '0' });
  } else if (mode === 'indefinite') {
    await redis.hset(posKey(slot), { protectedIndefinite: '1' });
  } else if (mode === 'off') {
    await redis.hset(posKey(slot), { protectedUntil: String(now), protectedIndefinite: '0' });
  } else {
    throw new Error('Modo de protección inválido');
  }
  return { status: 'ok', mode };
}

/** Admin rechaza (pago no llegó, monto no coincide, etc.): libera el puesto */
export async function rejectPayment(slot) {
  await redis.del(lockKey(slot));
  await offerNextInQueue(slot);
  return { status: 'rejected' };
}

/** Admin vacía un puesto YA ocupado (ej: contenido inapropiado, acuerdo cancelado, etc.) */
export async function evictPosition(slot) {
  if (!SLOTS.includes(Number(slot))) throw new Error('slot inválido');
  await redis.del(posKey(slot));
  return { status: 'evicted' };
}

/**
 * El front usa esto mientras el usuario está en la pantalla de "esperando
 * confirmación", para saber apenas el admin confirma (o rechaza) SU reserva
 * puntual, sin exponer datos de nadie más.
 */
export async function getReservationStatus(slot, reservationId) {
  if (!SLOTS.includes(Number(slot)) || !reservationId) return { status: 'not_found' };

  const lock = await redis.hgetall(lockKey(slot));
  if (lock && lock.reservationId === reservationId) {
    return { status: lock.status }; // 'locked' (todavía en cola/pagando) o 'awaiting_confirmation'
  }

  const pos = await redis.hgetall(posKey(slot));
  if (pos && pos.reservationId === reservationId) {
    return { status: 'confirmed' };
  }

  // Ni en el lock activo ni en el puesto confirmado: la rechazaron, venció, o la reemplazó otra cosa.
  return { status: 'not_found' };
}

/** Admin: detalle completo de cada pago esperando revisión, para poder identificarlo en la wallet */
export async function getPendingLocks() {
  const results = [];
  for (const slot of SLOTS) {
    const lock = await redis.hgetall(lockKey(slot));
    if (lock && lock.status === 'awaiting_confirmation') {
      results.push({
        rank: slot,
        reservationId: lock.reservationId,
        platform: lock.platform,
        handle: lock.handle,
        title: lock.title,
        desc: lock.desc,
        btnText: lock.btnText,
        link: lock.link || null,
        ticker: lock.ticker || null,
        contact: lock.contact || null,
        bid: Number(lock.bid),
        amount: Number(lock.amount),
        createdAt: lock.createdAt ? Number(lock.createdAt) : null,
      });
    }
  }
  return results;
}

/**
 * Llamado por el cron cada 1 min: libera locks vencidos que nadie confirmó
 * y le ofrece el turno al siguiente de la cola, al mismo precio.
 */
export async function cleanupExpiredLocks() {
  const now = Date.now();
  const results = [];
  for (const slot of SLOTS) {
    const lock = await redis.hgetall(lockKey(slot));
    if (lock && lock.status === 'locked' && Number(lock.lockExpiresAt) <= now) {
      await redis.del(lockKey(slot));
      const offered = await offerNextInQueue(slot);
      results.push({ slot, expired: true, offeredTo: offered });
    }
  }
  return results;
}

/** Saca al primero de la cola (si hay) y le arma un lock nuevo con el mismo precio */
async function offerNextInQueue(slot) {
  const raw = await redis.lpop(queueKey(slot));
  if (!raw) return null;
  const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;

  const now = Date.now();
  const amount = uniqueAmount(entry.bid);
  const expiresAt = now + LOCK_MINUTES * 60_000;

  await redis.hset(lockKey(slot), {
    reservationId: entry.reservationId,
    status: 'locked',
    platform: entry.platform, handle: entry.handle, title: entry.title, desc: entry.desc, btnText: entry.btnText, contact: entry.contact, link: entry.link, ticker: entry.ticker,
    bid: String(entry.bid),
    amount: String(amount),
    lockExpiresAt: String(expiresAt),
    createdAt: String(entry.requestedAt || now),
  });
  await redis.expire(lockKey(slot), LOCK_MINUTES * 60 + 60);

  return { reservationId: entry.reservationId, contact: entry.contact, amount, expiresAt };
}

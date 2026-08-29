import { redis } from './redis';
import { STARTS, INCREMENTS, PROTECTION_HOURS, LOCK_MINUTES, minToDisplace, round2, uniqueAmount } from './pricing';

const SLOTS = [1, 2, 3, 4, 5];
const posKey = (slot) => `position:${slot}`;
const lockKey = (slot) => `lock:${slot}`;
const queueKey = (slot) => `queue:${slot}`;

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Lee un puesto + calcula los campos derivados (protegido, horas restantes, mínimo para desplazar) */
export async function getPosition(slot) {
  const [pos, lock] = await Promise.all([redis.hgetall(posKey(slot)), redis.hgetall(lockKey(slot))]);

  const hasOccupant = pos && pos.name;
  const now = Date.now();
  const protectedUntil = hasOccupant ? Number(pos.protectedUntil || 0) : 0;
  const protectedHoursLeft = hasOccupant ? Math.max(0, (protectedUntil - now) / 3_600_000) : 0;

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
    price: hasOccupant ? Number(pos.price) : null,
    paidAt: pos?.paidAt || null,
    protectedHoursLeft: round2(protectedHoursLeft),
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
  return Promise.all(SLOTS.map(getPosition));
}

/**
 * Intenta reservar un puesto. Si está libre, crea el lock con TTL de LOCK_MINUTES.
 * Si está tomado, encola al usuario (FIFO) y devuelve su lugar en la cola.
 */
export async function reservePosition(slot, { platform, handle, title, desc, btnText, contact, bid: requestedBid }) {
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
    const entry = { reservationId, platform, handle, title, desc, btnText, contact, requestedAt: now, bid };
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
    platform, handle, title, desc, btnText, contact,
    bid: String(bid),
    amount: String(amount),
    lockExpiresAt: String(expiresAt),
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
  await redis.hset(posKey(slot), {
    name: lock.title,
    desc: lock.desc,
    platform: lock.platform,
    url: lock.handle,
    cta: lock.btnText,
    price: lock.bid,
    paidAt: String(now),
    protectedUntil: String(now + PROTECTION_HOURS * 3_600_000),
  });
  await redis.del(lockKey(slot));

  await offerNextInQueue(slot);
  return { status: 'confirmed' };
}

/** Admin rechaza (pago no llegó, monto no coincide, etc.): libera el puesto */
export async function rejectPayment(slot) {
  await redis.del(lockKey(slot));
  await offerNextInQueue(slot);
  return { status: 'rejected' };
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
    platform: entry.platform, handle: entry.handle, title: entry.title, desc: entry.desc, btnText: entry.btnText, contact: entry.contact,
    bid: String(entry.bid),
    amount: String(amount),
    lockExpiresAt: String(expiresAt),
  });
  await redis.expire(lockKey(slot), LOCK_MINUTES * 60 + 60);

  return { reservationId: entry.reservationId, contact: entry.contact, amount, expiresAt };
}

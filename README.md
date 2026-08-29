1# cima. — backend (puestos, lock, cola, admin manual)

Esto cubre los puntos 1 y 2 que hablamos: persistencia real de los 5 puestos + sistema de
lock de 18 min con cola FIFO. Todavía **no** incluye la verificación automática contra
TronGrid/Tronscan — eso queda para el siguiente paso.

## Qué hace

- **`GET /api/positions`** — devuelve el estado real de los 5 puestos (ocupante, precio,
  horas de protección restantes, mínimo para desplazar, si hay un lock activo).
- **`POST /api/positions/[slot]/reserve`** — intenta tomar un puesto. Si está libre, te da un
  lock de 18 minutos y un monto único con 6 decimales para pagar. Si está tomado, te encola
  (FIFO) y te dice qué lugar ocupás en la cola.
- **`POST /api/positions/[slot]/mark-paid`** — el usuario avisa "ya pagué": congela el lock
  (sin límite de tiempo) hasta que vos lo confirmes o rechaces a mano.
- **`POST /api/admin/positions/[slot]/confirm`** — (protegido con `ADMIN_TOKEN`) vos revisás
  la wallet a mano, ves que el monto llegó, y confirmás: el puesto pasa a estar ocupado por
  ese proyecto, con las 48hs de garantía arrancando en ese momento.
- **`POST /api/admin/positions/[slot]/reject`** — si el pago no llegó o no coincide, liberás
  el puesto (y si hay alguien en la cola, se le ofrece automáticamente).
- **`GET /api/cron/cleanup`** — pensado para que lo llame el cron de Vercel cada 1 minuto:
  libera locks vencidos donde nadie avisó que pagó, y le ofrece el turno al siguiente de la
  cola, al mismo precio (tal como definiste en el prompt original).
- **`/admin`** — página mínima para ver los pagos pendientes y confirmar/rechazar con un
  click, sin necesitar Redis CLI ni nada técnico.

## Cómo ponerlo en marcha (esto sí lo tenés que hacer vos)

1. **Crear el proyecto en GitHub** y subir esta carpeta (o pedime que te arme el repo si
   preferís otra forma de deployar).
2. **Deployar en Vercel**: importás el repo, Vercel detecta que es Next.js solo.
3. **Conectar Redis**: en el dashboard de Vercel → tu proyecto → **Storage** → **Create
   Database** → **Upstash Redis** (hay un plan gratis que alcanza de sobra para esto).
   Vercel completa automáticamente `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` en
   las variables de entorno del proyecto.
4. **Variables de entorno propias** (Vercel → Settings → Environment Variables):
   - `ADMIN_TOKEN` — inventá un string largo random, es tu "contraseña" para `/admin`.
   - `CRON_SECRET` — otro string random. Vercel lo usa automáticamente para autenticar el
     cron job contra `/api/cron/cleanup` (ver `vercel.json`, ya está configurado para
     correr cada 1 minuto).
5. **Redeploy** después de cargar las variables.
6. Entrá a `https://tu-proyecto.vercel.app/admin`, pegá tu `ADMIN_TOKEN` ahí, y listo.

## Lo que falta después de esto

- Conectar el `cima.html` (el front que ya tenés) para que en vez de usar datos mock, haga
  `fetch` a estos endpoints. Es un cambio acotado, te lo armo cuando quieras.
- El script de verificación automática contra TronGrid/Tronscan, para que `confirm` no lo
  hagas más a mano.
- Notificación al admin (Telegram/email) cuando hay un pago esperando revisión.

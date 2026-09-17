# cima. — Resumen del proyecto (actualizado)

## Qué es
Topweb de posiciones pagas (top 5) con mecánica de subasta tipo **"rey de la montaña"**: quien ocupa un puesto se queda ahí hasta que otro pague más para desplazarlo. No hay escalera automática por tiempo ni por ventas — solo plata.

Arrancó pensado para **vibecoders/programadores** y se pivoteó a una versión para **memecoins**, que es la que está construida y funcionando hoy.

Referencia/inspiración original: lugarcito.online.

---

## Mecánica de negocio

- **Puestos:** 5, numerados #1 a #5.
- **Precio de arranque:** $500 (puesto #1) bajando hasta $100 (puesto #5).
- **Incrementos para desplazar:** fijos, no porcentuales — $100 / $70 / $50 / $35 / $20 según el puesto.
- **Protección:** 48hs garantizadas desde que se confirma el pago — nadie puede desplazar al ocupante en ese lapso. **Nuevo:** el admin puede además, puesto por puesto, poner **protección indefinida** (sin límite de tiempo) o sacarle toda protección a mano desde el panel.
- **Pasadas las 48hs (o si no hay protección indefinida activa):** cualquiera puede desplazarlo pagando el precio actual + el incremento fijo de esa posición. Al desplazado no se le devuelve nada.
- **Cobro:** 100% manual en USDT (TRC20), sin pasarela automática — el admin confirma cada pago a mano desde el panel, viendo la wallet.
- **Historial de desplazados (nuevo):** cuando a alguien lo desplazan de un puesto top-5, su publicación queda archivada automáticamente y aparece en la sección "ver todos los puestos" de la home. El admin puede borrar entradas puntuales de ese historial desde el panel.

### Ideas para el futuro (no implementadas)
- Que amigos/comunidad puedan aportar entre varios para bancar un puesto (crowdfunding del lugar).
- Ver "cima" como motor reutilizable para otros nichos (ranking de "quién es más rico" / flex-status).
- Evaluar un agente de IA llevando las redes de estos proyectos.
- Traducir todo el sitio al inglés (pendiente, sin definir todavía si apunta a la misma audiencia cripto global o a un público nuevo).
- Reorientar el copy del hero hacia "probar que quien puja realmente tiene plata" (contra la cultura larp/flexeo cripto), en vez de solo preguntar cuánto pagaría. Se armaron y evaluaron varias variantes de headline con este ángulo; quedó pendiente para una próxima etapa junto con la traducción.

---

## Stack técnico

- **Frontend:** un único archivo estático `public/cima.html` (HTML + CSS + JS vanilla, sin build step). Toda la UI —landing, wizard de publicación, checkout, panel admin— vive ahí.
- **Backend:** Next.js (API routes) + Vercel.
- **Base de datos:** Redis (Upstash), vía `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (o las variantes `KV_*` / `REDIS_URL`).
- **Auth admin:** un `ADMIN_TOKEN` (variable de entorno en Vercel), comparado contra un header `x-admin-token` en cada request del panel `/admin`.
- **Repo:** `cima-backend` (Vercel).

### Archivos clave
- `public/cima.html` — landing, wizard, checkout, tarjetas de puestos, canvas de fondo, carrusel de criptos.
- `public/terminos.html` **(nuevo)** — página aparte de Términos y Condiciones: qué es cima, disclaimer de "no nos hacemos responsables", aclaración de que es un experimento temporal, cómo funciona la relación entre las partes, y el detalle de cómo funciona la protección de 48hs/indefinida.
- `lib/positions.js` — lógica de reserva, cola, locks, confirmación de pago, lectura de estado de los 5 puestos, modos de protección (`setProtection`) e historial de desplazados (`archiveDisplaced` / `getDisplacedList` / `deleteDisplaced`).
- `lib/pricing.js` — precios de arranque e incrementos por puesto.
- `pages/api/positions/[slot]/reserve.js` — endpoint de reserva de un puesto.
- `pages/api/displaced.js` **(nuevo)** — endpoint público que devuelve el historial de puestos desplazados, para la sección "ver todos los puestos" de la home.
- `pages/api/admin/positions/[slot]/protection.js` **(nuevo)** — endpoint admin para poner un puesto en modo `48h` / `indefinite` / `off`.
- `pages/api/admin/displaced/[id]/delete.js` **(nuevo)** — endpoint admin para borrar una entrada puntual del historial de desplazados.
- `pages/admin.js` — panel de administración (login por token, confirmar/rechazar pagos pendientes, **switches de protección por puesto**, **vaciar puesto**, y **sección de historial de desplazados con borrado**).

### Flujo de una publicación
1. **Reservar** (`reserve`) → el puesto queda en estado `locked`, con 18 minutos para pagar y avisar.
2. **Avisar que pagó** (`mark-paid`) → pasa a `awaiting_confirmation`, aparece en el panel admin bajo "Pagos esperando confirmación" con el monto exacto (con decimales únicos) a buscar en la wallet.
3. **Admin confirma o rechaza** desde `/admin` → si confirma, se publica el puesto (arrancan las 48hs de protección estándar; el admin puede después cambiarla a indefinida o sacarla desde los switches). Si el puesto ya tenía a alguien, ese alguien pasa automáticamente al historial de desplazados. Si rechaza, el lock se libera y el puesto vuelve a estar vacío.
4. Si nadie avisa el pago dentro de los 18 minutos, el lock se libera solo (limpieza perezosa al cargar la página, sin depender de un cron).

---

## Wizard de publicación (datos que pide)

1. **Plataforma / a dónde mandás a la gente:** Instagram, X, "Listado en" (dónde está listada la cripto, ej. pump.fun), o Link externo.
2. **Ticker:** hasta 6 letras, siempre visible (ej. `PEPE`). Se muestra como tag dorado al lado del título.
3. **Título** (máx. 40 caracteres).
4. **Una línea más** — descripción corta (máx. 110 caracteres).
5. **Texto del botón** (máx. 20 caracteres).

Toda la tarjeta del puesto en la página principal es clickeable y lleva al link configurado.

---

## Diseño / estética

- **Paleta:** fondo negro (`#050505`), tarjetas casi negras, texto y bordes en tonos plateados.
- **Puesto #1:** badge dorado brillante con glow pulsante en el contorno de la tarjeta.
- **Puestos #2 a #5:** degradé de tonos entre dorado y plateado puro (#5).
- **Brillo animado (shimmer):** un reflejo que atraviesa todos los badges de puesto.
- **Título "#1" y botón principal ("Llévate el puesto #1..."):** gradiente dorado brillante con glow y brillo animado (shine) recorriéndolo en loop.
- **QR de pago:** fondo forzado en blanco puro (más allá del tema oscuro) para no romper el escaneo.
- **Fondo animado por scroll:** un `<canvas>` fijo detrás de todo el contenido dibuja un frame de una secuencia de imágenes según cuánto scrolleaste la página. Con fade-in de opacidad corto y elegante al cargar/recargar la página (independiente de si hay autoplay o no). Soporta un autoplay lento opcional que hace correr los frames solos cuando nadie toca la pantalla, y se corta apenas el usuario scrollea/arrastra, siguiendo la velocidad del dedo. Frames reales ya cargados y funcionando (`public/frames/bg-desktop/` y `public/frames/bg-mobile/`), autoplay actualmente desactivado por decisión propia.
- **Carrusel infinito de criptos:** tira delgada con ícono circular + nombre (Bitcoin, Ethereum, USDT, BNB, Solana, XRP, Cardano, Dogecoin, TRON, Litecoin) que se desliza sola en loop, ubicada entre el botón principal y la lista de puestos.

---

## Copywriting

- **Headline actual:** "¿Pagarías 500 dólares para ser el #1 de criptos?" (elegida entre 20 variantes generadas con la misma cantidad de caracteres que el headline original, para no romper el layout).
- Placeholders de ejemplo: título "PepeRocket (PEPRKT)", descripción "La próxima gema de Solana. Presale abierta, liquidez bloqueada.", botón "Comprar ahora".
- Contacto: `@geo_ecom` (perfil real de X) en header, footer y disclaimer.
- Pantalla de espera de confirmación: menciona que "el escáner cripto está revisando la blockchain" buscando el pago.
- Página de Términos y Condiciones nueva, con el disclaimer completo de responsabilidad y de que el proyecto es un experimento temporal.

---

## Estado actual (al día de hoy)

✅ Landing, wizard, checkout y panel admin funcionando end-to-end (probado en producción).
✅ Precios, colores, copy y campos (ticker + link) adaptados a memecoins.
✅ `ADMIN_TOKEN` configurado y funcionando en Vercel producción.
✅ Fondo animado por scroll: frames reales cargados y funcionando, con fade-in de opacidad y autoplay lento opcional (hoy desactivado).
✅ Carrusel infinito de criptomonedas en la home.
✅ Estilo dorado brillante en el "#1" del hero y en el botón principal.
✅ Headline actualizado con enfoque de "prueba de plata real" (versión elegida entre 20 alternativas del mismo largo).
✅ Página de Términos y Condiciones (`terminos.html`) escrita y enlazada desde los 3 puntos del sitio que antes apuntaban a "#".
✅ Protección por puesto con 3 modos (48hs / indefinida / sin protección), controlable desde switches en el panel admin.
✅ Historial de puestos desplazados: se archiva automáticamente al confirmar un nuevo pago sobre un puesto ocupado, visible en la home ("ver todos los puestos") y administrable (borrado) desde el panel.

🔧 **Pendiente operativo (no es código):** llenar los 5 puestos con crédito propio a los precios base, para que el sitio no arranque vacío el día del lanzamiento.
🔧 **Pendiente para más adelante:** traducción del sitio al inglés.
🔧 **Pendiente para más adelante:** reorientar el copy del hero/mecánica hacia el ángulo de "prueba de plata real vs. larp cripto" de forma más profunda (headline ya se movió en esa dirección; falta el resto del copy del sitio si se decide seguir por ahí).

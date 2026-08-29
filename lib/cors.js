// Envuelve un handler de API para que se pueda llamar desde cima.html
// aunque ese archivo esté alojado en otro lado (localmente, otro hosting, etc).
export function allowCors(handler) {
  return async function wrapped(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    return handler(req, res);
  };
}

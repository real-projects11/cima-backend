import { cleanupExpiredLocks } from '../../../lib/positions';

export default async function handler(req, res) {
  // Vercel Cron manda este header automáticamente cuando la llamada viene de su scheduler.
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const results = await cleanupExpiredLocks();
    res.status(200).json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

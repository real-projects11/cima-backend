import { getPendingLocks } from '../../../lib/positions';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const pending = await getPendingLocks();
    res.status(200).json({ pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

import { rejectPayment } from '../../../../../lib/positions';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { slot } = req.query;
  try {
    const result = await rejectPayment(slot);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

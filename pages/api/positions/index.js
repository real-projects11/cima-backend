import { getAllPositions } from '../../../lib/positions';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const positions = await getAllPositions();
    res.status(200).json({ positions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

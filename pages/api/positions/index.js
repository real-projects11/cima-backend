import { getAllPositions } from '../../../lib/positions';
import { allowCors } from '../../../lib/cors';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const positions = await getAllPositions();
    res.status(200).json({ positions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export default allowCors(handler);

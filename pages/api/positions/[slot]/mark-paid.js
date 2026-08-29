import { markPaid } from '../../../../lib/positions';
import { allowCors } from '../../../../lib/cors';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const { slot } = req.query;
  const { reservationId } = req.body || {};

  if (!reservationId) return res.status(400).json({ error: 'Falta reservationId' });

  try {
    const result = await markPaid(slot, reservationId);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export default allowCors(handler);

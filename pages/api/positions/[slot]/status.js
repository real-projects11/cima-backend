import { getReservationStatus } from '../../../../lib/positions';
import { allowCors } from '../../../../lib/cors';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  const { slot, reservationId } = req.query;

  if (!reservationId) return res.status(400).json({ error: 'Falta reservationId' });

  try {
    const result = await getReservationStatus(slot, reservationId);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export default allowCors(handler);

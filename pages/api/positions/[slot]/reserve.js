import { reservePosition } from '../../../../lib/positions';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const { slot } = req.query;
  const { platform, handle, title, desc, btnText, contact } = req.body || {};

  if (!platform || !handle || !title || !desc || !btnText) {
    return res.status(400).json({ error: 'Faltan campos del proyecto' });
  }

  try {
    const result = await reservePosition(slot, { platform, handle, title, desc, btnText, contact });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

import { useEffect, useState } from 'react';

export default function Admin() {
  const [token, setToken] = useState('');
  const [positions, setPositions] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setToken(localStorage.getItem('cima_admin_token') || '');
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    const res = await fetch('/api/positions');
    const data = await res.json();
    setPositions(data.positions || []);
  }

  function saveToken(v) {
    setToken(v);
    localStorage.setItem('cima_admin_token', v);
  }

  async function act(slot, action) {
    setMsg('');
    const res = await fetch(`/api/admin/positions/${slot}/${action}`, {
      method: 'POST',
      headers: { 'x-admin-token': token },
    });
    const data = await res.json();
    if (!res.ok) setMsg(`Error puesto #${slot}: ${data.error}`);
    else setMsg(`Puesto #${slot} ${action === 'confirm' ? 'confirmado' : 'rechazado'} ✓`);
    load();
  }

  const pending = positions.filter((p) => p.locked && p.lockStatus === 'awaiting_confirmation');

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>cima. — admin</h1>

      <label style={{ display: 'block', margin: '16px 0 24px' }}>
        Admin token{' '}
        <input
          type="password"
          value={token}
          onChange={(e) => saveToken(e.target.value)}
          style={{ marginLeft: 8, padding: 6, width: 260 }}
        />
      </label>

      {msg && <p>{msg}</p>}

      <h2>Pagos esperando confirmación</h2>
      {pending.length === 0 && <p>No hay nada pendiente ahora mismo.</p>}
      {pending.map((p) => (
        <div key={p.rank} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 14, marginBottom: 10 }}>
          <b>Puesto #{p.rank}</b>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => act(p.rank, 'confirm')} style={{ padding: '8px 14px' }}>
              ✓ Confirmar pago
            </button>
            <button onClick={() => act(p.rank, 'reject')} style={{ padding: '8px 14px' }}>
              ✕ Rechazar / liberar
            </button>
          </div>
        </div>
      ))}

      <h2>Estado de los 5 puestos</h2>
      {positions.map((p) => (
        <div key={p.rank} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
          #{p.rank} — {p.occupied ? p.name : '(vacío)'} {p.occupied && `· $${p.price} · ${p.protectedHoursLeft.toFixed(1)}h de garantía restante`}
          {p.locked && ` · lock activo (${p.lockStatus})`}
        </div>
      ))}
    </div>
  );
}

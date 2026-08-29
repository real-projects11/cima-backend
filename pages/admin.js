import { useEffect, useState } from 'react';

const RANK_COLORS = {
  1: { bg: '#F0B23D', tint: '#FBF1DD', text: '#B4790C' },
  2: { bg: '#1C8F6E', tint: '#E3F1EC', text: '#146B52' },
  3: { bg: '#2B99B4', tint: '#E2F1F4', text: '#1C7A94' },
  4: { bg: '#8467D6', tint: '#EEEAFA', text: '#6947B8' },
  5: { bg: '#CC6440', tint: '#FAEAE3', text: '#B34A25' },
};

export default function Admin() {
  const [token, setToken] = useState('');
  const [positions, setPositions] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busySlot, setBusySlot] = useState(null);

  useEffect(() => {
    setToken(localStorage.getItem('cima_admin_token') || '');
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    try {
      const res = await fetch('/api/positions');
      const data = await res.json();
      setPositions(data.positions || []);
    } catch (e) {}
  }

  function saveToken(v) {
    setToken(v);
    localStorage.setItem('cima_admin_token', v);
  }

  async function act(slot, action, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setMsg(null);
    setBusySlot(slot + action);
    try {
      const res = await fetch(`/api/admin/positions/${slot}/${action}`, {
        method: 'POST',
        headers: { 'x-admin-token': token },
      });
      const data = await res.json();
      if (!res.ok) setMsg({ ok: false, text: `Puesto #${slot}: ${data.error}` });
      else setMsg({ ok: true, text: `Puesto #${slot} — acción "${action}" aplicada ✓` });
    } catch (e) {
      setMsg({ ok: false, text: 'No se pudo conectar con el servidor' });
    }
    setBusySlot(null);
    load();
  }

  const pending = positions.filter((p) => p.locked && p.lockStatus === 'awaiting_confirmation');

  return (
    <div className="wrap">
      <div className="brandRow">
        <div className="mark">▲</div>
        <h1>cima<span className="dot">.</span> <span className="sub">admin</span></h1>
      </div>

      <div className="card">
        <label className="fieldLabel">Admin token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => saveToken(e.target.value)}
          placeholder="Pegá tu ADMIN_TOKEN acá"
          className="input"
        />
      </div>

      {msg && <div className={`toast ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

      <h2 className="sectionTitle">Pagos esperando confirmación</h2>
      {pending.length === 0 && <p className="muted">No hay nada pendiente ahora mismo.</p>}
      <div className="grid">
        {pending.map((p) => {
          const c = RANK_COLORS[p.rank];
          return (
            <div className="card pendingCard" key={p.rank} style={{ borderColor: c.bg }}>
              <div className="badge" style={{ background: c.bg }}>#{p.rank}</div>
              <div className="pendingLabel">Puesto en revisión</div>
              <div className="btnRow">
                <button
                  className="btn primary"
                  disabled={busySlot === p.rank + 'confirm'}
                  onClick={() => act(p.rank, 'confirm')}
                >
                  ✓ Confirmar pago
                </button>
                <button
                  className="btn danger"
                  disabled={busySlot === p.rank + 'reject'}
                  onClick={() => act(p.rank, 'reject')}
                >
                  ✕ Rechazar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="sectionTitle">Estado de los 5 puestos</h2>
      <div className="grid">
        {positions.map((p) => {
          const c = RANK_COLORS[p.rank];
          return (
            <div className="card posCard" key={p.rank} style={{ borderColor: p.occupied ? c.bg : '#E2E4DE' }}>
              <div className="badge" style={{ background: p.occupied ? c.bg : '#DDDFD9', color: p.rank === 1 && p.occupied ? '#5B3D08' : '#fff' }}>
                #{p.rank}
              </div>
              {p.occupied ? (
                <>
                  <div className="posName">{p.name}</div>
                  <div className="posMeta">
                    ${p.price} · {p.protectedHoursLeft.toFixed(1)}h de garantía restante
                  </div>
                  {p.locked && <div className="lockTag">lock activo ({p.lockStatus})</div>}
                  <button
                    className="btn outline"
                    disabled={busySlot === p.rank + 'evict'}
                    onClick={() => act(p.rank, 'evict', `¿Seguro que querés vaciar el puesto #${p.rank}? Esto saca a "${p.name}" inmediatamente.`)}
                  >
                    Vaciar puesto
                  </button>
                </>
              ) : (
                <div className="posEmpty">
                  Vacío
                  {p.locked && <div className="lockTag">lock activo ({p.lockStatus})</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; }
        body { background: #EDEFEB; margin: 0; font-family: -apple-system, Inter, sans-serif; color: #14171A; }
      `}</style>
      <style jsx>{`
        .wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 60px; }
        .brandRow { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
        .mark { width: 32px; height: 32px; border-radius: 9px; background: #12664F; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; }
        h1 { font-size: 24px; font-weight: 800; margin: 0; }
        .dot { color: #12664F; }
        .sub { font-weight: 500; color: #6B7075; font-size: 16px; }
        .card { background: #fff; border: 1.5px solid #E2E4DE; border-radius: 16px; padding: 16px 18px; margin-bottom: 24px; box-shadow: 0 1px 2px rgba(20,23,26,.04); }
        .fieldLabel { display: block; font-size: 12.5px; font-weight: 700; color: #6B7075; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .04em; }
        .input { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1.5px solid #E2E4DE; background: #F7F8F5; font-size: 14px; outline: none; }
        .input:focus { border-color: #12664F; background: #fff; }
        .sectionTitle { font-size: 15px; font-weight: 800; margin: 28px 0 12px; }
        .muted { color: #9CA0A6; font-size: 13.5px; }
        .grid { display: flex; flex-direction: column; gap: 10px; }
        .badge { display: inline-flex; width: fit-content; border-radius: 8px; padding: 3px 9px; font-weight: 800; font-size: 13px; color: #fff; margin-bottom: 10px; }
        .pendingCard, .posCard { border-width: 1.5px; }
        .pendingLabel { font-weight: 700; margin-bottom: 12px; }
        .btnRow { display: flex; gap: 8px; }
        .btn { padding: 9px 14px; border-radius: 100px; font-weight: 700; font-size: 13px; border: none; cursor: pointer; }
        .btn.primary { background: #12664F; color: #fff; }
        .btn.danger { background: #FBE7E2; color: #B34A25; }
        .btn.outline { background: #fff; border: 1.5px solid #E2E4DE; color: #14171A; margin-top: 6px; }
        .btn:disabled { opacity: .5; cursor: default; }
        .posName { font-weight: 700; font-size: 15px; }
        .posMeta { font-size: 12.5px; color: #6B7075; margin-top: 2px; }
        .posEmpty { color: #9CA0A6; font-size: 13.5px; }
        .lockTag { font-size: 11px; color: #A05A0C; margin-top: 6px; }
        .toast { padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
        .toast.ok { background: #E3F1EC; color: #146B52; }
        .toast.err { background: #FBE7E2; color: #B34A25; }
      `}</style>
    </div>
  );
}

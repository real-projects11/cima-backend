// Mismas reglas que definiste en el prompt original: incremento fijo por
// posición (no porcentual), sin techo.
export const STARTS = { 1: 3, 2: 2, 3: 1.5, 4: 1, 5: 0.5 };
export const INCREMENTS = { 1: 2, 2: 1.5, 3: 1, 4: 0.75, 5: 0.5 };

export const PROTECTION_HOURS = 48;
export const LOCK_MINUTES = 18;

export function minToDisplace(position) {
  if (!position || !position.price) return STARTS[position.rank] || 0;
  return round2(position.price + (INCREMENTS[position.rank] || 0.5));
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

// Genera el monto único con 6 decimales que identifica cada reserva
// sin depender de memo (USDT TRC20 no tiene memo).
export function uniqueAmount(baseAmount) {
  const micro = Math.floor(Math.random() * 900000) + 50000; // 0.050000 a 0.949999
  return round6(baseAmount + micro / 1000000);
}

export function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

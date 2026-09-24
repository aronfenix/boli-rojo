export const emptyProgress = () => ({ stars: [0, 0, 0, 0, 0, 0], best: {}, rebels: {}, diff: 'normal', seenIntro: false });

export function profileKey(studentId, partnerId = null) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(studentId)) throw new Error('Identidad inválida');
  if (partnerId == null) return `solo:${studentId}`;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(partnerId) || partnerId === studentId) throw new Error('Pareja inválida');
  return `pair:${[studentId, partnerId].sort().join(':')}`;
}

function recordMap(value, maxKeys, maxValue) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Datos inválidos');
  const entries = Object.entries(value);
  if (entries.length > maxKeys) throw new Error('Demasiados datos');
  const result = {};
  for (const [key, n] of entries) {
    if (key.length > 80 || !Number.isSafeInteger(n) || n < 0 || n > maxValue) throw new Error('Datos inválidos');
    if (n) result[key] = n;
  }
  return result;
}

export function cleanProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Progreso inválido');
  const stars = value.stars ?? [0, 0, 0, 0, 0, 0];
  if (!Array.isArray(stars) || stars.length !== 6 || stars.some(n => !Number.isInteger(n) || n < 0 || n > 3)) throw new Error('Estrellas inválidas');
  const diff = value.diff ?? 'normal';
  if (!['tranqui', 'normal', 'turbo'].includes(diff)) throw new Error('Dificultad inválida');
  return { stars: [...stars], best: recordMap(value.best, 40, 100000000), rebels: recordMap(value.rebels, 500, 6), diff, seenIntro: value.seenIntro === true };
}

export function mergeProgress(local, remote) {
  const a = cleanProgress(local), b = cleanProgress(remote);
  const combined = (x, y) => Object.fromEntries(Array.from(new Set([...Object.keys(x), ...Object.keys(y)]), k => [k, Math.max(x[k] || 0, y[k] || 0)]).filter(([, n]) => n));
  return { stars: a.stars.map((n, i) => Math.max(n, b.stars[i])), best: combined(a.best, b.best), rebels: combined(a.rebels, b.rebels), diff: a.diff, seenIntro: a.seenIntro || b.seenIntro };
}

export function preserveAchievements(incoming, stored) {
  const a = cleanProgress(incoming), b = cleanProgress(stored);
  const best = { ...b.best };
  for (const [key, score] of Object.entries(a.best)) best[key] = Math.max(score, best[key] || 0);
  return { stars: a.stars.map((n, i) => Math.max(n, b.stars[i])), best, rebels: a.rebels, diff: a.diff, seenIntro: a.seenIntro || b.seenIntro };
}

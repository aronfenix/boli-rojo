import { cleanProgress, emptyProgress, profileKey, preserveAchievements } from './model.js';

const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes));
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const digest = async text => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
const randomToken = () => bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const safeEqual = async (a, b) => {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return difference === 0;
};
async function hashPassword(password, salt) {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 210000, hash: 'SHA-256' }, material, 256);
  return hex(new Uint8Array(bits));
}
async function body(request) {
  if (Number(request.headers.get('content-length') || 0) > 35000) throw new Error('Datos demasiado largos');
  const text = await request.text();
  if (text.length > 35000) throw new Error('Datos demasiado largos');
  try { return JSON.parse(text); } catch { throw new Error('Formato incorrecto'); }
}
function cookie(request) {
  return /(?:^|;\s*)br_session=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || null;
}
async function session(request, db) {
  const token = cookie(request);
  if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
  return db.prepare('SELECT s.student_id, s.teacher, st.name, st.username FROM sessions s LEFT JOIN students st ON st.id=s.student_id WHERE s.token_hash=? AND s.expires_at>? AND (s.teacher=1 OR st.active=1)')
    .bind(await digest(token), now()).first();
}
function identity(row) { return row?.teacher ? { role: 'teacher', name: 'Profe' } : row ? { role: 'student', id: row.student_id, name: row.name, username: row.username } : null; }
const cleanUsername = value => String(value || '').trim().toLowerCase();
async function rateLimit(db, key) {
  const row = await db.prepare('SELECT failures, blocked_until FROM login_attempts WHERE attempt_key=?').bind(key).first();
  return row && row.blocked_until > now();
}
async function failedLogin(db, key) {
  const previous = await db.prepare('SELECT failures,blocked_until FROM login_attempts WHERE attempt_key=?').bind(key).first();
  const failures = ((previous?.blocked_until || 0) > 0 && previous.blocked_until <= now() ? 0 : previous?.failures || 0) + 1;
  await db.prepare('INSERT INTO login_attempts(attempt_key, failures, blocked_until) VALUES(?,?,?) ON CONFLICT(attempt_key) DO UPDATE SET failures=excluded.failures, blocked_until=excluded.blocked_until')
    .bind(key, failures, failures >= 5 ? now() + 900 : 0).run();
}
function setSession(token) { return `br_session=${token}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`; }
const clearSession = 'br_session=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
async function profile(request, env, student) {
  const url = new URL(request.url);
  const input = request.method === 'GET' ? { partner: url.searchParams.get('partner') } : await body(request);
  const partner = input.partner || null;
  if (partner && !(await env.DB.prepare('SELECT 1 FROM students WHERE id=? AND active=1').bind(partner).first())) return json({ error: 'Compañero no disponible' }, 404);
  let key;
  try { key = profileKey(student.student_id, partner); } catch { return json({ error: 'Pareja inválida' }, 400); }
  const get = () => env.DB.prepare('SELECT progress_json, version FROM profiles WHERE profile_key=?').bind(key).first();
  const current = await get();
  if (request.method === 'GET') return json({ key, version: current?.version || 0, progress: current ? JSON.parse(current.progress_json) : emptyProgress() });
  let progress;
  try { progress = cleanProgress(input.progress); } catch (e) { return json({ error: e.message }, 400); }
  if (!Number.isSafeInteger(input.version) || input.version < 0) return json({ error: 'Versión inválida' }, 400);
  if (current) progress = preserveAchievements(progress, JSON.parse(current.progress_json));
  const serialized = JSON.stringify(progress);
  let result;
  if (input.version === 0) {
    result = await env.DB.prepare('INSERT OR IGNORE INTO profiles(profile_key,progress_json,version,updated_at) VALUES(?,?,1,?)').bind(key, serialized, now()).run();
  } else {
    result = await env.DB.prepare('UPDATE profiles SET progress_json=?,version=version+1,updated_at=? WHERE profile_key=? AND version=?').bind(serialized, now(), key, input.version).run();
  }
  const saved = await get();
  if (!result.meta.changes) return json({ error: 'conflict', key, version: saved?.version || 0, progress: saved ? JSON.parse(saved.progress_json) : emptyProgress() }, 409);
  return json({ key, version: saved.version, progress });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 405 });
    if (!['GET', 'POST', 'PUT'].includes(request.method)) return json({ error: 'Método inválido' }, 405);
    if (request.method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({ error: 'Origen inválido' }, 403);
    if (url.pathname === '/api/status' && request.method === 'GET') return json({ online: !!env.DB, configured: !!env.TEACHER_PASSWORD });
    if (!env.DB) return json({ error: 'Base de datos sin configurar' }, 503);
    try {
      if (url.pathname === '/api/login' && request.method === 'POST') {
        if (!env.TEACHER_PASSWORD) return json({ error: 'Servidor sin configurar' }, 503);
        const input = await body(request), username = cleanUsername(input.username), password = String(input.password || '');
        if (!/^[a-z0-9._-]{3,32}$/.test(username) || password.length > 200) return json({ error: 'Datos incorrectos' }, 400);
        const ip = request.headers.get('cf-connecting-ip') || 'local';
        const attemptKey = await digest(`${ip}:${username}`);
        if (await rateLimit(env.DB, attemptKey)) return json({ error: 'Espera 15 minutos antes de volver a intentarlo' }, 429);
        let ok = false, student = null;
        if (username === 'profe') ok = await safeEqual(password, env.TEACHER_PASSWORD);
        else {
          student = await env.DB.prepare('SELECT id,name,username,password_salt,password_hash FROM students WHERE username=? AND active=1').bind(username).first();
          if (student) ok = await safeEqual(await hashPassword(password, student.password_salt), student.password_hash);
          else await hashPassword(password, 'unknown-user-salt');
        }
        if (!ok) { await failedLogin(env.DB, attemptKey); return json({ error: 'Usuario o contraseña incorrectos' }, 401); }
        await env.DB.prepare('DELETE FROM login_attempts WHERE attempt_key=?').bind(attemptKey).run();
        const token = randomToken();
        await env.DB.prepare('INSERT INTO sessions(token_hash, student_id, teacher, expires_at) VALUES(?,?,?,?)').bind(await digest(token), student?.id || null, username === 'profe' ? 1 : 0, now() + 2592000).run();
        return json({ user: username === 'profe' ? { role: 'teacher', name: 'Profe' } : { role: 'student', id: student.id, name: student.name, username: student.username } }, 200, { 'set-cookie': setSession(token) });
      }
      const auth = await session(request, env.DB);
      if (url.pathname === '/api/me' && request.method === 'GET') return json({ user: identity(auth) });
      if (url.pathname === '/api/logout' && request.method === 'POST') {
        const token = cookie(request);
        if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
        return json({ ok: true }, 200, { 'set-cookie': clearSession });
      }
      if (!auth) return json({ error: 'Inicia sesión' }, 401);
      if (url.pathname === '/api/students' && request.method === 'GET') {
        const students = await env.DB.prepare('SELECT id,name FROM students WHERE active=1 ORDER BY name,id').all();
        return json({ students: students.results });
      }
      if (url.pathname === '/api/profile' && ['GET', 'PUT'].includes(request.method) && !auth.teacher) return profile(request, env, auth);
      if (url.pathname === '/api/admin/students' && auth.teacher) {
        if (request.method === 'GET') {
          const students = await env.DB.prepare('SELECT id,username,name,active FROM students ORDER BY name').all();
          return json({ students: students.results });
        }
        if (request.method === 'POST') {
          const input = await body(request), username = cleanUsername(input.username), name = String(input.name || '').trim(), password = String(input.password || '');
          if (!/^[a-z0-9._-]{3,32}$/.test(username) || username === 'profe' || name.length < 2 || name.length > 40 || password.length < 8 || password.length > 100) return json({ error: 'Revisa nombre, usuario y contraseña (mínimo 8 caracteres)' }, 400);
          const id = crypto.randomUUID(), salt = randomToken();
          try {
            await env.DB.prepare('INSERT INTO students(id,username,name,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?)')
              .bind(id, username, name, salt, await hashPassword(password, salt), now()).run();
          } catch { return json({ error: 'Ese usuario ya existe' }, 409); }
          return json({ student: { id, username, name } }, 201);
        }
      }
      if (url.pathname === '/api/admin/reset' && auth.teacher && request.method === 'POST') {
        const input = await body(request), id = String(input.id || ''), password = String(input.password || '');
        if (!/^[a-zA-Z0-9-]{1,80}$/.test(id) || password.length < 8 || password.length > 100) return json({ error: 'Contraseña inválida' }, 400);
        const salt = randomToken();
        const updated = await env.DB.prepare('UPDATE students SET password_salt=?,password_hash=? WHERE id=? AND active=1').bind(salt, await hashPassword(password, salt), id).run();
        if (!updated.meta.changes) return json({ error: 'Alumno no encontrado' }, 404);
        await env.DB.prepare('DELETE FROM sessions WHERE student_id=?').bind(id).run();
        return json({ ok: true });
      }
      if (url.pathname === '/api/admin/profiles' && auth.teacher && request.method === 'GET') {
        const profiles = await env.DB.prepare('SELECT profile_key,progress_json,updated_at FROM profiles ORDER BY updated_at DESC LIMIT 1000').all();
        return json({ profiles: profiles.results.map(p => ({ key: p.profile_key, progress: JSON.parse(p.progress_json), updatedAt: p.updated_at })) });
      }
      return json({ error: 'No encontrado' }, 404);
    } catch (e) {
      if (['Datos demasiado largos', 'Formato incorrecto'].includes(e.message)) return json({ error: e.message }, 400);
      return json({ error: 'No se pudo completar la solicitud' }, 500);
    }
  }
};

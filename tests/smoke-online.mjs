// Run against a local Wrangler server after applying migrations.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8787';
const teacherPassword = process.env.TEST_TEACHER_PASSWORD || 'TestTeacherPass123';
async function call(path, method = 'GET', data, cookie = '') {
  const response = await fetch(base + '/api/' + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}
const unique = randomUUID().slice(0, 8);
assert.equal((await call('status')).data.configured, true);
assert.equal((await call('students')).status, 401);
const teacher = await call('login', 'POST', { username: 'profe', password: teacherPassword });
assert.equal(teacher.status, 200);
const first = await call('admin/students', 'POST', { name: 'Alba Prueba', username: 'alba' + unique, password: 'albaPass123' }, teacher.cookie);
const second = await call('admin/students', 'POST', { name: 'Diego Prueba', username: 'diego' + unique, password: 'diegoPass123' }, teacher.cookie);
assert.equal(first.status, 201); assert.equal(second.status, 201);
const alba = await call('login', 'POST', { username: 'alba' + unique, password: 'albaPass123' });
const diego = await call('login', 'POST', { username: 'diego' + unique, password: 'diegoPass123' });
assert.equal(alba.status, 200); assert.equal(diego.status, 200);
const solo = await call('profile', 'GET', undefined, alba.cookie);
assert.equal(solo.data.key, `solo:${first.data.student.id}`);
const partner = second.data.student.id;
const duo = await call('profile?partner=' + partner, 'GET', undefined, alba.cookie);
assert.equal(duo.data.version, 0);
const saved = await call('profile', 'PUT', { partner, version: 0, progress: { stars: [2, 0, 0, 0, 0, 0], best: {}, rebels: {}, diff: 'normal', seenIntro: true } }, alba.cookie);
assert.equal(saved.status, 200);
const seenByDiego = await call('profile?partner=' + first.data.student.id, 'GET', undefined, diego.cookie);
assert.equal(seenByDiego.data.key, saved.data.key);
assert.equal(seenByDiego.data.progress.stars[0], 2);
const stale = await call('profile', 'PUT', { partner, version: 0, progress: { stars: [0, 0, 0, 0, 0, 0] } }, alba.cookie);
assert.equal(stale.status, 409);
const later = await call('profile', 'PUT', { partner, version: saved.data.version, progress: { stars: [0, 0, 0, 0, 0, 0], best: {}, rebels: { vaca: 1 }, diff: 'tranqui' } }, alba.cookie);
assert.equal(later.data.progress.stars[0], 2);
assert.equal(later.data.progress.rebels.vaca, 1);
const reports = await call('admin/profiles', 'GET', undefined, teacher.cookie);
assert.equal(reports.status, 200);
assert.ok(reports.data.profiles.some(p => p.key === saved.data.key));
const reset = await call('admin/reset', 'POST', { id: first.data.student.id, password: 'albaNewPass123' }, teacher.cookie);
assert.equal(reset.status, 200);
assert.equal((await call('profile', 'GET', undefined, alba.cookie)).status, 401);
assert.equal((await call('login', 'POST', { username: 'alba' + unique, password: 'albaNewPass123' })).status, 200);
assert.equal((await call('profile', 'GET', undefined, teacher.cookie)).status, 404);
console.log('API smoke passed: teacher, students, solo, shared pair, version conflict, password reset, access boundaries');

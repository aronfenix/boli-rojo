const Accounts = (() => {
  const overlay = document.getElementById('account-overlay');
  const badge = document.getElementById('sync-badge');
  let available = false, configured = false, user = null, active = null, saving = false, timer = null;
  const pendingKey = key => `boliRojo.pending.${key}`;
  const empty = () => ({ stars: [0, 0, 0, 0, 0, 0], best: {}, rebels: {}, diff: 'normal', seenIntro: false });
  const merge = (a, b) => {
    const high = (x, y) => Object.fromEntries(Array.from(new Set([...Object.keys(x || {}), ...Object.keys(y || {})]), k => [k, Math.max(x?.[k] || 0, y?.[k] || 0)]).filter(([, n]) => n));
    return { stars: a.stars.map((n, i) => Math.max(n, b.stars[i])), best: high(a.best, b.best), rebels: high(a.rebels, b.rebels), diff: a.diff, seenIntro: a.seenIntro || b.seenIntro };
  };
  async function api(path, options = {}) {
    const response = await fetch('/api/' + path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...options });
    const result = await response.json();
    if (!response.ok) { const e = new Error(result.error || 'Error de conexión'); e.status = response.status; e.data = result; throw e; }
    return result;
  }
  async function init() {
    try {
      const result = await api('status'); available = result.online; configured = result.configured;
      if (available && configured) user = (await api('me')).user;
    } catch { available = false; configured = false; }
    return available && configured;
  }
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key === 'onClick') node.addEventListener('click', value);
      else node.setAttribute(key, value);
    }
    for (const child of children) node.append(child);
    return node;
  }
  function field(label, type, value = '') {
    const input = el('input', { type, required: '', value, autocomplete: type === 'password' ? 'current-password' : 'off' });
    return { input, nodes: [el('label', { text: label }), input] };
  }
  function close() { overlay.classList.remove('open'); overlay.replaceChildren(); }
  function show(title, content) {
    overlay.replaceChildren(el('div', { class: 'card' }, [el('h2', { text: title }), ...content]));
    overlay.classList.add('open');
  }
  function errorMessage(message) {
    const box = overlay.querySelector('.error');
    if (box) box.textContent = message;
  }
  function login() {
    const username = field('Usuario', 'text'), password = field('Contraseña', 'password');
    const message = el('p', { class: 'error', role: 'alert' });
    const submit = el('button', { class: 'primary', type: 'submit', text: 'ENTRAR' });
    const form = el('form', {}, [...username.nodes, ...password.nodes, message, el('div', { class: 'actions' }, [submit, el('button', { type: 'button', class: 'secondary', text: 'VOLVER', onClick: close })])]);
    form.addEventListener('submit', async e => {
      e.preventDefault(); submit.disabled = true; errorMessage('');
      try {
        user = (await api('login', { method: 'POST', body: JSON.stringify({ username: username.input.value, password: password.input.value }) })).user;
        password.input.value = ''; await home();
      } catch (err) { errorMessage(err.message); }
      finally { submit.disabled = false; }
    });
    show('Mi partida online', [el('p', { text: 'Entra con el usuario y la contraseña que te ha dado el profe.' }), form]);
    username.input.focus();
  }
  async function logout() {
    try { await api('logout', { method: 'POST', body: '{}' }); } catch { /* A fresh login still requires valid credentials. */ }
    user = null; active = null; badge.className = ''; login();
  }
  function currentProgress() {
    if (!active || !Game.team) return null;
    const t = Game.team;
    return { stars: [...t.stars], best: { ...t.best }, rebels: { ...t.rebels }, diff: t.diff, seenIntro: !!t.seenIntro };
  }
  function syncBadge(text, warn = false) { badge.textContent = text; badge.className = 'show' + (warn ? ' warn' : ''); }
  function scheduleSave() {
    if (!active || Game.team?.onlineKey !== active.key) return;
    try { localStorage.setItem(pendingKey(active.key), JSON.stringify(currentProgress())); } catch { /* Server sync still runs. */ }
    syncBadge('Guardando…'); clearTimeout(timer); timer = setTimeout(flush, 350);
  }
  async function flush() {
    if (!active || saving) return;
    const key = pendingKey(active.key); let raw = localStorage.getItem(key);
    if (!raw) return;
    const selected = active; saving = true;
    try {
      let progress = JSON.parse(raw);
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const saved = await api('profile', { method: 'PUT', body: JSON.stringify({ partner: selected.partner, version: selected.version, progress }) });
          selected.version = saved.version;
          if (active === selected && Game.team?.onlineKey === selected.key) {
            Game.team.stars = Game.team.stars.map((n, i) => Math.max(n, saved.progress.stars[i]));
            for (const [name, score] of Object.entries(saved.progress.best)) Game.team.best[name] = Math.max(Game.team.best[name] || 0, score);
            Game.team.seenIntro = Game.team.seenIntro || saved.progress.seenIntro;
          }
          if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
          if (active === selected) syncBadge(localStorage.getItem(key) ? 'Guardando…' : 'Guardado online');
          break;
        } catch (err) {
          if (err.status !== 409) throw err;
          selected.version = err.data.version;
          progress = merge(JSON.parse(localStorage.getItem(key) || raw), err.data.progress);
          raw = JSON.stringify(progress);
          localStorage.setItem(key, raw);
        }
      }
    } catch (err) { if (active === selected) syncBadge('Sin conexión · pendiente', true); }
    finally { saving = false; if (active === selected && localStorage.getItem(key)) timer = setTimeout(flush, 5000); }
  }
  async function choose(partner, partnerName) {
    try {
      const result = await api('profile' + (partner ? `?partner=${encodeURIComponent(partner)}` : ''));
      const pending = localStorage.getItem(pendingKey(result.key));
      const progress = pending ? merge(JSON.parse(pending), result.progress) : result.progress;
      active = { key: result.key, partner, version: result.version };
      Game.team = { ...progress, id: result.key, onlineKey: result.key, names: partner ? [user.name, partnerName] : [user.name], last: Date.now() };
      close(); syncBadge(pending ? 'Guardando…' : 'Guardado online');
      if (pending) scheduleSave();
      go(() => Game.team.seenIntro ? new MapScene() : introDialogue());
    } catch (err) { errorMessage(err.message); }
  }
  async function studentHome() {
    let students;
    try { students = (await api('students')).students.filter(s => s.id !== user.id); }
    catch (err) { show('Mi partida online', [el('p', { class: 'error', text: err.message }), el('button', { text: 'REINTENTAR', onClick: studentHome })]); return; }
    const select = el('select', { 'aria-label': 'Elige compañero' }, students.map(s => el('option', { value: s.id, text: s.name })));
    const message = el('p', { class: 'error', role: 'alert' });
    const solo = el('button', { class: 'primary', text: 'JUGAR YO SOLO', onClick: () => choose(null, null) });
    const duo = el('button', { text: 'JUGAR CON PAREJA', onClick: () => {
      const s = students.find(x => x.id === select.value); if (s) choose(s.id, s.name);
    } });
    duo.disabled = !students.length;
    show('Hola, ' + user.name, [
      el('p', { text: 'Tú formas parte de la partida. Elige si juegas solo o con otra persona de la clase.' }),
      el('div', { class: 'actions' }, [solo]),
      el('label', { text: 'Mi compañero o compañera' }), select,
      el('div', { class: 'actions' }, [duo]), message,
      el('div', { class: 'actions' }, [el('button', { class: 'secondary', text: 'CERRAR SESIÓN', onClick: logout }), el('button', { class: 'secondary', text: 'VOLVER', onClick: close })])
    ]);
  }
  async function teacherHome() {
    let students, profiles;
    try { [students, profiles] = await Promise.all([api('admin/students').then(r => r.students), api('admin/profiles').then(r => r.profiles)]); }
    catch (err) { show('Alumnos online', [el('p', { class: 'error', text: err.message })]); return; }
    const name = field('Nombre visible', 'text'), username = field('Usuario único', 'text'), password = field('Contraseña inicial (8 caracteres o más)', 'password');
    const message = el('p', { class: 'error', role: 'alert' });
    const form = el('form', {}, [...name.nodes, ...username.nodes, ...password.nodes, message, el('div', { class: 'actions' }, [el('button', { class: 'primary', type: 'submit', text: 'CREAR ALUMNO' })])]);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api('admin/students', { method: 'POST', body: JSON.stringify({ name: name.input.value, username: username.input.value, password: password.input.value }) });
        password.input.value = ''; await teacherHome();
      } catch (err) { message.textContent = err.message; }
    });
    const resetSelect = el('select', { 'aria-label': 'Alumno para cambiar contraseña' }, students.map(s => el('option', { value: s.id, text: `${s.name} · ${s.username}` })));
    const newPassword = field('Nueva contraseña', 'password'), resetMessage = el('p', { class: 'error', role: 'alert' });
    const resetForm = el('form', {}, [el('label', { text: 'Alumno' }), resetSelect, ...newPassword.nodes, resetMessage, el('div', { class: 'actions' }, [el('button', { type: 'submit', text: 'CAMBIAR CONTRASEÑA' })])]);
    resetForm.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api('admin/reset', { method: 'POST', body: JSON.stringify({ id: resetSelect.value, password: newPassword.input.value }) });
        newPassword.input.value = ''; resetMessage.textContent = 'Contraseña cambiada. El alumno deberá entrar de nuevo.';
      } catch (err) { resetMessage.textContent = err.message; }
    });
    const names = Object.fromEntries(students.map(s => [s.id, s.name]));
    const titleOf = key => key.startsWith('solo:') ? names[key.slice(5)] || 'Alumno' : key.slice(5).split(':').map(id => names[id] || 'Alumno').join(' y ');
    show('Alumnos online', [
      el('p', { text: 'Crea cuentas individuales. Cada alumno podrá entrar desde cualquier dispositivo y elegir su propia partida o una pareja.' }),
      form, el('h3', { text: `Cuentas creadas: ${students.length}` }),
      el('ul', { class: 'roster' }, students.map(s => el('li', { text: `${s.name} · ${s.username}` }))),
      el('h3', { text: 'Cambiar contraseña' }), resetForm,
      el('h3', { text: 'Progreso online' }),
      el('ul', { class: 'roster' }, profiles.map(p => el('li', { text: `${titleOf(p.key)} · ${p.progress.stars.reduce((a, b) => a + b, 0)} / 18 estrellas` }))),
      el('div', { class: 'actions' }, [el('button', { class: 'secondary', text: 'CERRAR SESIÓN', onClick: logout }), el('button', { class: 'secondary', text: 'VOLVER', onClick: close })])
    ]);
  }
  async function home() { if (user?.role === 'teacher') await teacherHome(); else if (user?.role === 'student') await studentHome(); else login(); }
  async function open() {
    if (!(await init())) {
      show('Juego online', [el('p', { text: available ? 'Falta configurar la contraseña del profe en el servidor.' : 'Esta copia aún no está conectada al servidor. Las partidas locales siguen disponibles.' }), el('button', { class: 'secondary', text: 'VOLVER', onClick: close })]);
      return;
    }
    await home();
  }
  window.addEventListener('online', flush);
  window.addEventListener('focus', flush);
  return { init, open, scheduleSave, clearActive() { active = null; badge.className = ''; }, get active() { return active; }, get available() { return available && configured; } };
})();

function token() { return localStorage.getItem('lms_token'); }

function storedUser() {
  try { return JSON.parse(localStorage.getItem('lms_user')); }
  catch (e) { return null; }
}

async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      token() ? { Authorization: 'Bearer ' + token() } : {}
    ),
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/login') {
    localStorage.clear();
    location.href = '/';
    throw new Error('unauthorised');
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function param(name) {
  return new URLSearchParams(location.search).get(name);
}

function plural(n, word, many) {
  return n + ' ' + (Number(n) === 1 ? word : (many || word + 's'));
}

function homeFor(role) {
  return role === 'admin' ? '/people' : '/dashboard';
}

function pct(part, whole) {
  return whole ? Math.round(part / whole * 100) : 0;
}

function progressBar(part, whole, size) {
  return '<div class="progress' + (size ? ' ' + size : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct(part, whole) + '">' +
    '<span style="width:' + pct(part, whole) + '%"></span></div>';
}

function initials(name) {
  return esc(String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase());
}

function avatar(name) {
  return '<span class="avatar">' + initials(name) + '</span>';
}

// "2026-09-05" -> "Fri, 5 Sep 2026". Parsed as local noon so no timezone shifts the day.
function niceDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const ICONS = {
  note: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'
};

function icon(name) {
  return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
}

function statTile(value, label, iconName) {
  return '<div class="stat">' +
    (iconName ? '<span class="stat-icon">' + icon(iconName) + '</span>' : '') +
    '<div><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div>' +
  '</div>';
}

// Topic status from its quizzes. A topic with no quiz yet cannot be completed.
function topicStatus(done, total) {
  if (!total) return { cls: 'none', text: 'No quiz yet' };
  if (done === total) return { cls: 'done', text: 'Completed' };
  if (done > 0) return { cls: 'doing', text: 'In progress' };
  return { cls: 'todo', text: 'Not started' };
}

// Renders the top bar and returns the signed-in user. Redirects if the
// role is not allowed on this page.
function requireUser(roles) {
  const user = storedUser();
  if (!user || !token()) { location.href = '/'; return null; }
  if (roles && !roles.includes(user.role)) { location.href = homeFor(user.role); return null; }

  const bar = document.createElement('header');
  bar.className = 'bar';
  bar.innerHTML =
    '<div class="bar-inner">' +
      '<a class="brand" href="' + homeFor(user.role) + '"><span class="brand-mark">' + icon('book') + '</span>Mahatma Phule LMS</a>' +
      '<div class="bar-right">' +
        '<span class="who">' + avatar(user.name) + '<span>' + esc(user.name) + '<small>' + user.role + '</small></span></span>' +
        '<button class="secondary" id="logout">Log out</button>' +
      '</div>' +
    '</div>';
  document.body.prepend(bar);
  bar.querySelector('#logout').onclick = async () => {
    try { await api('POST', '/logout'); } catch (e) {}
    localStorage.clear();
    location.href = '/';
  };
  return user;
}

// A button that slides its panel open and shut. The button keeps its own
// label while closed and reads "Cancel" while the panel is showing.
function slideToggle(buttonId, panelId) {
  const btn = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);
  const label = btn.querySelector('.label');
  const openText = label.textContent;

  const inner = panel.querySelector('.panel-inner');
  let settleTimer = null;

  // Once the slide has finished, hand the height back to the content so the
  // panel can grow on its own (a quiz gains questions while it is open).
  function settle() {
    if (!panel.classList.contains('open')) return;
    panel.style.height = 'auto';
    panel.classList.add('settled');
  }

  function set(open) {
    if (open === panel.classList.contains('open')) return;
    panel.classList.toggle('open', open);
    panel.classList.remove('settled');
    btn.classList.toggle('open', open);
    label.textContent = open ? 'Cancel' : openText;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');

    clearTimeout(settleTimer);

    if (open) {
      panel.style.height = inner.offsetHeight + 'px';
      // Backstop for when transitionend does not arrive, e.g. reduced motion.
      settleTimer = setTimeout(settle, 420);
    } else {
      // From auto back to a pixel height, so the close has something to animate.
      panel.style.height = panel.offsetHeight + 'px';
      void panel.offsetHeight;
      panel.style.height = '0px';
    }
  }

  panel.addEventListener('transitionend', e => {
    if (e.propertyName === 'height') settle();
  });

  btn.setAttribute('aria-expanded', 'false');
  btn.onclick = () => set(!panel.classList.contains('open'));
  return { close: () => set(false), open: () => set(true) };
}

// Plain tab switcher; the active tab is kept in the URL hash so a reload stays put.
function tabs(container) {
  const buttons = [...container.querySelectorAll('[data-tab]')];
  function show(name) {
    if (!buttons.some(b => b.dataset.tab === name)) name = buttons[0].dataset.tab;
    buttons.forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      document.getElementById('tab-' + b.dataset.tab).hidden = !on;
    });
    history.replaceState(null, '', '#' + name);
  }
  buttons.forEach(b => { b.onclick = () => show(b.dataset.tab); });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1));
  return show;
}

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
      '<a class="brand" href="' + homeFor(user.role) + '">Mahatma Phule LMS</a>' +
      '<div class="bar-right">' +
        '<span>' + esc(user.name) + ' &middot; ' + user.role + '</span>' +
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
  return { close: () => set(false) };
}

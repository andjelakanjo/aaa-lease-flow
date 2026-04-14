// Redirect invite/recovery tokens to /auth/confirm (hash or query; Supabase usually uses hash).
(function redirectInviteLinks() {
  const hash = window.location.hash;
  const search = window.location.search;
  const hp = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : '');
  const sp = new URLSearchParams(search);
  const token = hp.get('access_token') || sp.get('access_token');
  const type = hp.get('type') || sp.get('type');
  if (!token || (type !== 'invite' && type !== 'recovery')) return;
  if (hp.get('access_token')) {
    window.location.replace('/auth/confirm' + hash);
    return;
  }
  window.location.replace('/auth/confirm#' + sp.toString());
})();

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('panel-' + tab)?.classList.add('active');
}

window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (!tab) return;
      switchTab(tab);
    });
  });

  // Auto-format access code input as user types.
  const accessCodeEl = document.getElementById('access-code');
  accessCodeEl?.addEventListener('input', function onAccessCodeInput() {
    const el = /** @type {HTMLInputElement} */ (this);
    let v = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3);
    if (v.length > 8) v = v.slice(0, 8) + '-' + v.slice(8);
    el.value = v.slice(0, 13);
  });

  // Email/password login.
  document.getElementById('form-email')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-email'));
    const err = document.getElementById('err-email');
    err?.classList.remove('show');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Signing in…';
    }

    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: /** @type {HTMLInputElement} */ (document.getElementById('email')).value.trim(),
          password: /** @type {HTMLInputElement} */ (document.getElementById('password')).value
        })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        window.location.href = data.redirect || '/app';
      } else {
        if (err) {
          err.textContent = data.error || 'Login failed. Please try again.';
          err.classList.add('show');
        }
      }
    } catch {
      if (err) {
        err.textContent = 'Network error — please try again.';
        err.classList.add('show');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sign in →';
      }
    }
  });

  // Access code login.
  document.getElementById('form-code')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-code'));
    const err = document.getElementById('err-code');
    err?.classList.remove('show');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Verifying…';
    }

    try {
      const res = await fetch('/auth/login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_code: /** @type {HTMLInputElement} */ (document.getElementById('access-code')).value.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        window.location.href = data.redirect || '/app';
      } else {
        if (err) {
          err.textContent = data.error || 'Invalid code. Please try again.';
          err.classList.add('show');
        }
      }
    } catch {
      if (err) {
        err.textContent = 'Network error — please try again.';
        err.classList.add('show');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Enter →';
      }
    }
  });

  // Forgot password (email/password users).
  document.getElementById('btn-forgot')?.addEventListener('click', async () => {
    const email = /** @type {HTMLInputElement} */ (document.getElementById('email')).value.trim();
    const err = document.getElementById('err-email');
    const ok = document.getElementById('forgot-ok');
    err?.classList.remove('show');
    ok?.classList.remove('show');

    if (!email) {
      if (err) {
        err.textContent = 'Enter your email first.';
        err.classList.add('show');
      }
      return;
    }

    try {
      const res = await fetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        ok?.classList.add('show');
      } else {
        // Keep generic message (don’t leak anything).
        ok?.classList.add('show');
      }
    } catch {
      if (err) {
        err.textContent = 'Network error — please try again.';
        err.classList.add('show');
      }
    }
  });
});


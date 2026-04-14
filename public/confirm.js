// Tokens usually arrive in the hash (#access_token=…). Query params are a rare fallback.
function parseAuthParams() {
  const merged = new URLSearchParams();
  if (window.location.hash.length > 1) {
    new URLSearchParams(window.location.hash.slice(1)).forEach((v, k) => merged.set(k, v));
  }
  new URLSearchParams(window.location.search).forEach((v, k) => merged.set(k, v));
  return Object.fromEntries(merged);
}
const params = parseAuthParams();
const accessToken = params.access_token;

function showInvalidState() {
  const formState = document.getElementById('form-state');
  const invalidState = document.getElementById('invalid-state');
  if (formState) formState.style.display = 'none';
  if (invalidState) invalidState.style.display = 'block';
}

window.addEventListener('DOMContentLoaded', () => {
  if (!accessToken) {
    showInvalidState();
    return;
  }

  document.getElementById('set-password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = /** @type {HTMLInputElement} */ (document.getElementById('password')).value;
    const confirm = /** @type {HTMLInputElement} */ (document.getElementById('password-confirm')).value;
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-submit'));
    const err = document.getElementById('err');
    const success = document.getElementById('success');

    err?.classList.remove('show');

    if (password !== confirm) {
      if (err) {
        err.textContent = 'Passwords do not match.';
        err.classList.add('show');
      }
      return;
    }
    if (password.length < 8) {
      if (err) {
        err.textContent = 'Password must be at least 8 characters.';
        err.classList.add('show');
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Setting password…';
    }

    try {
      const res = await fetch('/auth/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, password })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        success?.classList.add('show');
        const form = document.getElementById('set-password-form');
        if (form) form.style.display = 'none';
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        if (err) {
          err.textContent = data.error || 'Failed to set password. Please try again.';
          err.classList.add('show');
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Set password →';
        }
      }
    } catch {
      if (err) {
        err.textContent = 'Network error — please try again.';
        err.classList.add('show');
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Set password →';
      }
    }
  });
});


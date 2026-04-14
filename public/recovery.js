window.addEventListener('DOMContentLoaded', () => {
  const sp = new URLSearchParams(window.location.search);
  const preEmail = sp.get('email');
  if (preEmail) {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById('email'));
    if (el) el.value = preEmail;
  }

  document.getElementById('recovery-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = /** @type {HTMLInputElement} */ (document.getElementById('email')).value.trim();
    const token = /** @type {HTMLInputElement} */ (document.getElementById('code')).value.replace(/\s/g, '');
    const password = /** @type {HTMLInputElement} */ (document.getElementById('password')).value;
    const confirm = /** @type {HTMLInputElement} */ (document.getElementById('password-confirm')).value;
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-submit'));
    const err = document.getElementById('err');
    const success = document.getElementById('success');

    err?.classList.remove('show');
    success?.classList.remove('show');

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
    if (!/^\d{6,12}$/.test(token)) {
      if (err) {
        err.textContent = 'Enter the code (numbers only, usually 6 digits).';
        err.classList.add('show');
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving…';
    }

    try {
      const res = await fetch('/auth/recovery-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, password })
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        success?.classList.add('show');
        const form = document.getElementById('recovery-form');
        if (form) form.style.display = 'none';
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        if (err) {
          err.textContent = data.error || 'Could not reset password. Try a new code from your admin.';
          err.classList.add('show');
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Save password →';
        }
      }
    } catch {
      if (err) {
        err.textContent = 'Network error — please try again.';
        err.classList.add('show');
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save password →';
      }
    }
  });
});

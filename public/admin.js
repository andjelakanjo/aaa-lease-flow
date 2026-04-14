// ── State ─────────────────────────────────────────────────────────────────────
let currentUser = null;
let companies = [];
let selectedUserId = null;
let userToDeleteId = null;
/** Profile id for super_admin “Set password” modal */
let selectedAuthUserId = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('/admin/api/me', { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      window.location.href = '/login';
      return;
    }
    currentUser = await res.json();
  } catch {
    window.location.href = '/login';
    return;
  }

  // Header
  const name =
    [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') ||
    currentUser.email ||
    'Admin';
  document.getElementById('user-name').textContent = name;
  const badge = document.getElementById('user-role-badge');
  badge.textContent = currentUser.role.replace('_', ' ');
  badge.className = `badge badge-${currentUser.role}`;

  // Super-admin-only elements
  if (currentUser.role === 'super_admin') {
    document.getElementById('tab-companies').style.display = '';
    document.getElementById('btn-create-admin').style.display = '';
  } else {
    document.getElementById('users-heading').textContent = 'Employees';
    document.getElementById('emp-company-field').style.display = 'none';
  }

  // Load data
  await Promise.all([loadUsers(), loadCompanies()]);
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadUsers() {
  const res = await fetch('/admin/api/users', { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    showToast('Failed to load users.', 'error');
    return;
  }
  const users = await res.json();
  renderUsers(users);
}

async function loadCompanies() {
  const res = await fetch('/admin/api/companies', { headers: { Accept: 'application/json' } });
  if (!res.ok) return;
  companies = await res.json();
  renderCompanies(companies);
  populateCompanySelects(companies);
}

// ── Render helpers ────────────────────────────────────────────────────────────
function renderUsers(users) {
  const tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No users yet.</td></tr>';
    return;
  }
  const viewerIsSuper = currentUser.role === 'super_admin';

  tbody.innerHTML = users
    .map((u) => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
      const company = u.companies?.name || '—';
      const expiry = formatExpiry(u.expires_at);
      const status = u.is_active
        ? `<span class="status-active">Active</span>`
        : `<span class="status-revoked">Revoked</span>`;

      const emailCell =
        u.role === 'employee'
          ? `<span style="color:var(--text-muted);font-size:.78rem">Access Code</span>`
          : `<span style="font-size:.82rem">${esc(u.email || '—')}</span>`;

      const hasEmailLogin = Boolean(u.user_id) && (u.role === 'admin' || u.role === 'super_admin');
      const passwordTools =
        viewerIsSuper && hasEmailLogin
          ? `<button class="btn-sm" type="button" data-action="generate-recovery-link" data-user-id="${esc(
              u.id
            )}">Reset link</button>
             <button class="btn-sm" type="button" data-action="open-set-password" data-user-id="${esc(
               u.id
             )}" data-user-name="${esc(name)}">Set password</button>`
          : '';

      let actions = passwordTools;

      // Employees + admins: lifecycle actions. Super_admin rows: password tools only (no delete/extend on peers).
      if (u.role !== 'super_admin') {
        const viewCodeBtn =
          u.role === 'employee' && u.access_code
            ? `<button class="btn-sm" type="button" data-action="open-view-code" data-code="${esc(u.access_code)}">View Code</button>`
            : '';
        actions += `
        ${viewCodeBtn}
        <button class="btn-sm" type="button" data-action="open-extend" data-user-id="${esc(u.id)}">Extend</button>
        ${
          u.is_active
            ? `<button class="btn-sm-danger" type="button" data-action="revoke-user" data-user-id="${esc(u.id)}">Revoke</button>`
            : ''
        }
        <button class="btn-sm-danger" type="button" data-action="open-delete-user" data-user-id="${esc(
          u.id
        )}" data-user-name="${esc(name)}">Delete</button>
      `;
      }

      return `<tr>
      <td>${esc(name)}</td>
      <td><span class="badge badge-${u.role}">${u.role.replace('_', ' ')}</span></td>
      <td>${emailCell}</td>
      <td>${esc(company)}</td>
      <td>${expiry}</td>
      <td>${status}</td>
      <td><div class="td-actions">${actions}</div></td>
    </tr>`;
    })
    .join('');
}

function renderCompanies(list) {
  const tbody = document.getElementById('companies-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3">No companies yet.</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .map(
      (c) => `
    <tr>
      <td>${esc(c.name)}</td>
      <td style="color:var(--text-muted);font-size:.82rem">${fmtDate(c.created_at)}</td>
      <td><div class="td-actions">
        <button class="btn-preview" type="button" data-action="preview-app" data-company-name="${esc(
          c.name
        )}" data-banner-sub="${esc('Gledaš kako zaposleni vide aplikaciju')}">👁 Preview App</button>
      </div></td>
    </tr>
  `
    )
    .join('');
}

function populateCompanySelects(list) {
  const opts = ['<option value="">— select company —</option>', ...list.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)].join('');
  document.getElementById('admin-company').innerHTML = opts;
  document.getElementById('emp-company').innerHTML = opts;
}

function formatExpiry(ts) {
  if (!ts) return '<span style="color:var(--text-muted)">Unlimited</span>';
  const d = new Date(ts);
  if (d < new Date()) return `<span class="status-expired">Expired ${fmtDate(ts)}</span>`;
  return fmtDate(ts);
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function esc(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.querySelectorAll('.modal-error').forEach((e) => {
    e.textContent = '';
    e.classList.remove('show');
  });
  modal.querySelectorAll('input').forEach((i) => (i.value = ''));
  modal.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

function setModalError(errId, msg) {
  const el = document.getElementById(errId);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function setSubmitLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (btn) btn.disabled = loading;
}

// ── Create Company ────────────────────────────────────────────────────────────
async function submitCompany() {
  const name = document.getElementById('company-name').value.trim();
  if (!name) {
    setModalError('err-company', 'Company name is required.');
    return;
  }

  setSubmitLoading('submit-company', true);
  const res = await fetch('/admin/api/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name })
  });
  const data = await res.json();
  setSubmitLoading('submit-company', false);

  if (!res.ok) {
    setModalError('err-company', data.error || 'Failed to create company.');
    return;
  }
  closeModal('modal-company');
  showToast('Company created.');
  await loadCompanies();
}

// ── Create Admin ──────────────────────────────────────────────────────────────
async function submitAdmin() {
  const first_name = document.getElementById('admin-first').value.trim();
  const last_name = document.getElementById('admin-last').value.trim();
  const email = document.getElementById('admin-email').value.trim();
  const company_id = document.getElementById('admin-company').value;

  if (!first_name || !last_name || !email || !company_id) {
    setModalError('err-admin', 'All fields are required.');
    return;
  }

  setSubmitLoading('submit-admin', true);
  const res = await fetch('/admin/api/users/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ first_name, last_name, email, company_id })
  });
  const data = await res.json();
  setSubmitLoading('submit-admin', false);

  if (!res.ok) {
    setModalError('err-admin', data.error || 'Failed to create admin.');
    return;
  }
  closeModal('modal-admin');
  await loadUsers();

  const link = data.invite_link || null;
  if (link) {
    document.getElementById('invite-link-value').textContent = link;
    document.getElementById('invite-copy-success').style.display = 'none';
    openModal('modal-invite-link');
    showToast('Admin created — invite link ready.');
  } else {
    showToast('Admin created.');
  }
}

// ── Create Employee ───────────────────────────────────────────────────────────
async function submitEmployee() {
  const first_name = document.getElementById('emp-first').value.trim();
  const last_name = document.getElementById('emp-last').value.trim();
  const expiry = document.getElementById('emp-expiry').value;
  const company_id =
    currentUser.role === 'super_admin'
      ? document.getElementById('emp-company').value
      : currentUser.companyId;

  if (!first_name || !last_name) {
    setModalError('err-employee', 'First name and last name are required.');
    return;
  }
  if (currentUser.role === 'super_admin' && !company_id) {
    setModalError('err-employee', 'Please select a company.');
    return;
  }

  setSubmitLoading('submit-employee', true);
  const res = await fetch('/admin/api/users/employee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ first_name, last_name, expiry, company_id })
  });
  const data = await res.json();
  setSubmitLoading('submit-employee', false);

  if (!res.ok) {
    setModalError('err-employee', data.error || 'Failed to create employee.');
    return;
  }
  closeModal('modal-employee');
  await loadUsers();

  document.getElementById('code-value').textContent = data.access_code;
  document.getElementById('copy-success').style.display = 'none';
  openModal('modal-access-code');
}

// ── Copy access code ──────────────────────────────────────────────────────────
function copyCode() {
  const code = document.getElementById('code-value').textContent;
  navigator.clipboard.writeText(code).then(() => {
    document.getElementById('copy-success').style.display = 'block';
  });
}

function copyInviteLink() {
  const link = document.getElementById('invite-link-value').textContent;
  navigator.clipboard.writeText(link).then(() => {
    document.getElementById('invite-copy-success').style.display = 'block';
  });
}

function copyRecoveryLink() {
  const link = document.getElementById('recovery-link-value').textContent;
  navigator.clipboard.writeText(link).then(() => {
    document.getElementById('recovery-copy-success').style.display = 'block';
  });
}

async function generateRecoveryLinkForUser(userId) {
  const res = await fetch(`/admin/api/users/${userId}/recovery-link`, {
    method: 'POST',
    headers: { Accept: 'application/json' }
  });
  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || 'Failed to generate reset link.', 'error');
    return;
  }
  if (!data.recovery_link) {
    showToast('No link returned.', 'error');
    return;
  }
  document.getElementById('recovery-link-value').textContent = data.recovery_link;
  document.getElementById('recovery-copy-success').style.display = 'none';
  openModal('modal-recovery-link');
}

function openSetPassword(userId, userName) {
  selectedAuthUserId = userId;
  openModal('modal-set-password');
  const label = document.getElementById('set-password-for-label');
  if (label) {
    label.textContent = userName ? `For: ${userName}` : 'Set a new password for this account.';
  }
}

async function submitSetPassword() {
  if (!selectedAuthUserId) return;
  const pw = document.getElementById('set-password-new')?.value || '';
  const confirm = document.getElementById('set-password-confirm')?.value || '';
  const errEl = document.getElementById('err-set-password');
  errEl?.classList.remove('show');

  if (pw !== confirm) {
    setModalError('err-set-password', 'Passwords do not match.');
    return;
  }
  if (pw.length < 8) {
    setModalError('err-set-password', 'Password must be at least 8 characters.');
    return;
  }

  setSubmitLoading('submit-set-password', true);
  const res = await fetch(`/admin/api/users/${selectedAuthUserId}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ password: pw })
  });
  const data = await res.json();
  setSubmitLoading('submit-set-password', false);

  if (!res.ok) {
    setModalError('err-set-password', data.error || 'Failed to set password.');
    return;
  }
  closeModal('modal-set-password');
  selectedAuthUserId = null;
  showToast('Password updated.');
}

// ── Extend Access ─────────────────────────────────────────────────────────────
function openExtend(userId) {
  selectedUserId = userId;
  document.getElementById('extend-expiry').value = '30days';
  document.getElementById('err-extend').classList.remove('show');
  document.getElementById('modal-extend').classList.add('open');
}

async function submitExtend() {
  if (!selectedUserId) return;
  const expiry = document.getElementById('extend-expiry').value;

  const res = await fetch(`/admin/api/users/${selectedUserId}/extend`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ expiry })
  });
  const data = await res.json();

  if (!res.ok) {
    setModalError('err-extend', data.error || 'Failed to extend access.');
    return;
  }
  closeModal('modal-extend');
  showToast('Access extended.');
  selectedUserId = null;
  await loadUsers();
}

// ── Revoke ────────────────────────────────────────────────────────────────────
async function revokeUser(userId) {
  if (!confirm('Revoke access for this user? They will be signed out immediately.')) return;

  const res = await fetch(`/admin/api/users/${userId}/revoke`, {
    method: 'PATCH',
    headers: { Accept: 'application/json' }
  });
  const data = await res.json();

  if (!res.ok) {
    showToast(data.error || 'Failed to revoke.', 'error');
    return;
  }
  showToast('Access revoked.');
  await loadUsers();
}

// ── View Access Code ──────────────────────────────────────────────────────────
function openViewCode(code) {
  document.getElementById('view-code-value').textContent = code;
  document.getElementById('view-copy-success').style.display = 'none';
  document.getElementById('modal-view-code').classList.add('open');
}

function copyViewCode() {
  const code = document.getElementById('view-code-value').textContent;
  navigator.clipboard.writeText(code).then(() => {
    document.getElementById('view-copy-success').style.display = 'block';
  });
}

// ── Delete User ───────────────────────────────────────────────────────────────
function openDeleteUser(userId, name) {
  userToDeleteId = userId;
  document.getElementById('delete-user-name').textContent = name;
  document.getElementById('delete-confirm-input').value = '';
  const errEl = document.getElementById('err-delete');
  errEl.textContent = '';
  errEl.classList.remove('show');
  document.getElementById('modal-delete').classList.add('open');
}

async function submitDelete() {
  if (!userToDeleteId) return;
  const input = document.getElementById('delete-confirm-input').value.trim();
  if (input !== 'delete') {
    setModalError('err-delete', 'Type "delete" to confirm.');
    return;
  }

  setSubmitLoading('submit-delete', true);
  const res = await fetch(`/admin/api/users/${userToDeleteId}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' }
  });
  const data = await res.json();
  setSubmitLoading('submit-delete', false);

  if (!res.ok) {
    setModalError('err-delete', data.error || 'Failed to delete user.');
    return;
  }
  closeModal('modal-delete');
  showToast('User deleted.');
  userToDeleteId = null;
  await loadUsers();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Preview App ───────────────────────────────────────────────────────────────
function previewApp(companyName, bannerSub) {
  document.getElementById('preview-co-name').textContent = companyName || 'AAA Lease';
  document.getElementById('preview-banner-sub').textContent =
    bannerSub || 'Gledaš kako zaposleni vide aplikaciju';
  const iframe = document.getElementById('preview-iframe');
  iframe.src = '';
  iframe.src = '/app?preview=true';
  const container = document.getElementById('preview-container');
  container.classList.add('open');
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function previewAppFromUsers() {
  let companyName = 'AAA Lease';
  let bannerSub = 'Gledaš kako zaposleni vide aplikaciju';
  if (currentUser?.role === 'admin') {
    const co = companies.find((c) => c.id === currentUser.companyId);
    companyName = co?.name || 'AAA Lease';
    bannerSub = 'Gledaš kako tvoji zaposleni vide aplikaciju';
  } else {
    companyName = companies[0]?.name || 'AAA Lease';
  }
  previewApp(companyName, bannerSub);
}

function closePreview() {
  document.getElementById('preview-container').classList.remove('open');
  document.getElementById('preview-iframe').src = '';
}

// ── Event wiring ──────────────────────────────────────────────────────────────
function setupEventHandlers() {
  // Close on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('open');
    });
  });

  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement|null} */ (e.target);
    const el = target?.closest?.('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');

    if (action === 'switch-tab') {
      const tab = el.getAttribute('data-tab');
      if (!tab) return;
      switchTab(tab, el);
      return;
    }

    if (action === 'open-modal') {
      const modal = el.getAttribute('data-modal');
      if (modal) openModal(modal);
      return;
    }

    if (action === 'close-modal') {
      const modal = el.getAttribute('data-modal');
      if (modal) closeModal(modal);
      return;
    }

    if (action === 'preview-app-from-users') return void previewAppFromUsers();
    if (action === 'close-preview') return void closePreview();

    if (action === 'submit-company') return void submitCompany();
    if (action === 'submit-admin') return void submitAdmin();
    if (action === 'submit-employee') return void submitEmployee();
    if (action === 'copy-code') return void copyCode();
    if (action === 'copy-view-code') return void copyViewCode();
    if (action === 'copy-invite-link') return void copyInviteLink();
    if (action === 'copy-recovery-link') return void copyRecoveryLink();
    if (action === 'submit-set-password') return void submitSetPassword();
    if (action === 'submit-extend') return void submitExtend();
    if (action === 'submit-delete') return void submitDelete();

    if (action === 'open-extend') {
      const userId = el.getAttribute('data-user-id');
      if (userId) openExtend(userId);
      return;
    }

    if (action === 'revoke-user') {
      const userId = el.getAttribute('data-user-id');
      if (userId) revokeUser(userId);
      return;
    }

    if (action === 'open-delete-user') {
      const userId = el.getAttribute('data-user-id');
      const userName = el.getAttribute('data-user-name') || '';
      if (userId) openDeleteUser(userId, userName);
      return;
    }

    if (action === 'open-view-code') {
      const code = el.getAttribute('data-code') || '';
      openViewCode(code);
      return;
    }

    if (action === 'generate-recovery-link') {
      const userId = el.getAttribute('data-user-id');
      if (userId) generateRecoveryLinkForUser(userId);
      return;
    }

    if (action === 'open-set-password') {
      const userId = el.getAttribute('data-user-id');
      const userName = el.getAttribute('data-user-name') || '';
      if (userId) openSetPassword(userId, userName);
      return;
    }

    if (action === 'preview-app') {
      const companyName = el.getAttribute('data-company-name') || 'AAA Lease';
      const bannerSub = el.getAttribute('data-banner-sub') || '';
      previewApp(companyName, bannerSub);
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  setupEventHandlers();
  init();
});


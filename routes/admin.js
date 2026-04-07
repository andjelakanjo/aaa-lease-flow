const express = require('express');
const router = express.Router();
const path = require('path');
const supabase = require('../config/supabase');

// ── Role guards ───────────────────────────────────────────────────────────────

function requireAdminRole(req, res, next) {
  if (!['super_admin', 'admin'].includes(req.user?.role)) {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    return res.redirect('/app');
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required.' });
  }
  next();
}

// Apply admin role check to all routes in this router
router.use(requireAdminRole);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a unique-ish access code in AAA-XXXX-XXXX format. */
function generateAccessCode() {
  // Omit ambiguous characters (0/O, 1/I)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `AAA-${seg()}-${seg()}`;
}

/** Convert a duration string to an ISO expiry timestamp (or null for unlimited). */
function calcExpiresAt(duration) {
  if (duration === '7days') {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  }
  if (duration === '30days') {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString();
  }
  return null; // unlimited
}

// ── Dashboard page ────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// ── API: current user ─────────────────────────────────────────────────────────

router.get('/api/me', (req, res) => {
  res.json({
    role: req.user.role,
    companyId: req.user.companyId,
    firstName: req.user.firstName,
    lastName: req.user.lastName,
    email: req.user.email || null
  });
});

// ── API: companies ────────────────────────────────────────────────────────────

router.get('/api/companies', async (req, res) => {
  const { data, error } = await supabase.admin
    .from('companies')
    .select('id, name, created_at')
    .order('name');

  if (error) return res.status(500).json({ error: 'Failed to fetch companies.' });
  res.json(data);
});

router.post('/api/companies', requireSuperAdmin, async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Company name is required.' });

  const { data, error } = await supabase.admin
    .from('companies')
    .insert({ name })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message || 'Failed to create company.' });
  res.json(data);
});

// ── API: users ────────────────────────────────────────────────────────────────

router.get('/api/users', async (req, res) => {
  let query = supabase.admin
    .from('profiles')
    .select('id, first_name, last_name, email, role, company_id, expires_at, is_active, created_at, companies(name)')
    .order('created_at', { ascending: false });

  // Admins see only their own company's employees
  if (req.user.role === 'admin') {
    query = query
      .eq('company_id', req.user.companyId)
      .eq('role', 'employee');
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch users.' });
  res.json(data);
});

// Create admin user (super_admin only) — sends an invite email via Supabase
router.post('/api/users/admin', requireSuperAdmin, async (req, res) => {
  const { first_name, last_name, email, company_id } = req.body;
  if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !company_id) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Invite the user — Supabase sends an email with a magic link to set their password
  const { data: invited, error: inviteError } =
    await supabase.admin.auth.admin.inviteUserByEmail(email.trim());
  if (inviteError) {
    return res.status(500).json({ error: inviteError.message || 'Failed to invite user.' });
  }

  // Create the profile record
  const { data: profile, error: profileError } = await supabase.admin
    .from('profiles')
    .insert({
      user_id: invited.user.id,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: email.trim(),
      role: 'admin',
      company_id,
      is_active: true
    })
    .select()
    .single();

  if (profileError) {
    return res.status(500).json({ error: profileError.message || 'Failed to create profile.' });
  }
  res.json(profile);
});

// Create employee (super_admin or admin)
router.post('/api/users/employee', async (req, res) => {
  const { first_name, last_name, expiry } = req.body;
  let { company_id } = req.body;

  if (!first_name?.trim() || !last_name?.trim()) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }

  // Admins always assign to their own company
  if (req.user.role === 'admin') {
    company_id = req.user.companyId;
  } else if (!company_id) {
    return res.status(400).json({ error: 'Company is required.' });
  }

  if (!['7days', '30days', 'unlimited'].includes(expiry)) {
    return res.status(400).json({ error: 'Invalid expiry value.' });
  }

  // Generate a unique access code (retry on collision)
  let access_code;
  for (let i = 0; i < 10; i++) {
    const candidate = generateAccessCode();
    const { data: existing } = await supabase.admin
      .from('profiles')
      .select('id')
      .eq('access_code', candidate)
      .maybeSingle();
    if (!existing) { access_code = candidate; break; }
  }
  if (!access_code) {
    return res.status(500).json({ error: 'Could not generate a unique access code.' });
  }

  const { data: profile, error } = await supabase.admin
    .from('profiles')
    .insert({
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      role: 'employee',
      company_id,
      access_code,
      expires_at: calcExpiresAt(expiry),
      is_active: true
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message || 'Failed to create employee.' });
  res.json(profile); // access_code is included in the select result
});

// ── API: user actions ─────────────────────────────────────────────────────────

router.patch('/api/users/:id/revoke', async (req, res) => {
  let query = supabase.admin
    .from('profiles')
    .update({ is_active: false })
    .eq('id', req.params.id);

  // Admins can only revoke their own company's employees
  if (req.user.role === 'admin') {
    query = query.eq('company_id', req.user.companyId).eq('role', 'employee');
  }

  const { error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to revoke access.' });
  res.json({ ok: true });
});

router.patch('/api/users/:id/extend', async (req, res) => {
  const { expiry } = req.body;
  if (!['7days', '30days', 'unlimited'].includes(expiry)) {
    return res.status(400).json({ error: 'Invalid expiry value.' });
  }

  let query = supabase.admin
    .from('profiles')
    .update({ expires_at: calcExpiresAt(expiry), is_active: true })
    .eq('id', req.params.id);

  // Admins can only extend their own company's employees
  if (req.user.role === 'admin') {
    query = query.eq('company_id', req.user.companyId).eq('role', 'employee');
  }

  const { error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to extend access.' });
  res.json({ ok: true });
});

module.exports = router;

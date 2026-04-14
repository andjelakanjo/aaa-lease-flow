const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { getAuthRedirectOrigin } = require('../lib/authRedirectOrigin');

// POST /auth/login — email + password
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Look up profile to determine role and redirect destination
  const { data: profile, error: profileError } = await supabase.admin
    .from('profiles')
    .select('role, is_active')
    .eq('user_id', data.user.id)
    .single();

  if (profile && profile.is_active === false) {
    return res.status(403).json({ error: 'Account has been revoked.' });
  }

  const role = profile?.role || 'employee';
  const redirect = (role === 'super_admin' || role === 'admin') ? '/admin' : '/app';

  res.cookie('sb_token', data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: data.session.expires_in * 1000
  });

  res.json({ ok: true, redirect });
});

// POST /auth/login-code — access code login (employees)
router.post('/login-code', async (req, res) => {
  const { access_code } = req.body;
  if (!access_code) return res.status(400).json({ error: 'Access code is required.' });

  const { data: profile, error } = await supabase.admin
    .from('profiles')
    .select('id, role, expires_at, is_active')
    .eq('access_code', access_code.toUpperCase().trim())
    .single();

  if (error || !profile) {
    return res.status(401).json({ error: 'Invalid access code.' });
  }
  if (!profile.is_active) {
    return res.status(401).json({ error: 'Access has been revoked.' });
  }
  if (profile.expires_at && new Date(profile.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Access code has expired.' });
  }

  res.cookie('ac_session', profile.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });

  res.json({ ok: true, redirect: '/app' });
});

// GET /auth/confirm — serve the set-password page for invite/recovery links
router.get('/confirm', (req, res) => {
  res.sendFile(require('path').join(__dirname, '..', 'public', 'confirm.html'));
});

// POST /auth/forgot-password — send a password recovery email (no user enumeration)
router.post('/forgot-password', async (req, res) => {
  const email = req.body?.email?.trim();
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const origin = getAuthRedirectOrigin(req);

  // Always return OK (prevents user enumeration). Supabase only sends if email exists.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm`
  });

  if (error) {
    console.error('[auth/forgot-password] resetPasswordForEmail failed:', error.message);
    // Still respond OK to avoid leaking existence / configuration details
  }

  res.json({ ok: true });
});

// POST /auth/confirm — set password using the access_token from the invite hash
router.post('/confirm', async (req, res) => {
  const { access_token, password } = req.body;

  if (!access_token || !password) {
    return res.status(400).json({ error: 'access_token and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  // Verify the token and get the user
  const { data: { user }, error: userError } = await supabase.auth.getUser(access_token);
  if (userError || !user) {
    return res.status(401).json({ error: 'Invalid or expired invite link.' });
  }

  // Update the password via admin client (confirm email so login works if confirmations are enforced)
  const { error: updateError } = await supabase.admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true
  });
  if (updateError) {
    console.error('[auth/confirm] updateUserById failed:', updateError.message);
    return res.status(500).json({ error: 'Failed to set password. Please try again.' });
  }

  res.json({ ok: true });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('sb_token', { httpOnly: true, secure: isProd, sameSite: 'lax' });
  res.clearCookie('ac_session', { httpOnly: true, secure: isProd, sameSite: 'lax' });
  res.redirect('/login');
});

// GET /auth/me
router.get('/me', async (req, res) => {
  const sbToken = req.cookies?.sb_token;
  const acSession = req.cookies?.ac_session;

  if (sbToken) {
    const { data: { user }, error } = await supabase.auth.getUser(sbToken);
    if (error || !user) return res.status(401).json({ error: 'Session invalid.' });

    const { data: profile } = await supabase.admin
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', user.id)
      .single();

    if (profile && profile.is_active === false) return res.status(403).json({ error: 'Account revoked.' });

    return res.json({ email: user.email, id: user.id, role: profile?.role || 'employee' });
  }

  if (acSession) {
    const { data: profile, error } = await supabase.admin
      .from('profiles')
      .select('id, role, is_active, expires_at')
      .eq('id', acSession)
      .single();

    if (error || !profile || !profile.is_active) return res.status(401).json({ error: 'Session invalid.' });
    if (profile.expires_at && new Date(profile.expires_at) < new Date()) return res.status(401).json({ error: 'Session expired.' });

    return res.json({ role: profile.role || 'employee' });
  }

  return res.status(401).json({ error: 'Not authenticated.' });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

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

  if (profileError) {
    console.error('[auth/login] profile lookup failed:', profileError.message, '| user_id:', data.user.id);
  }

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

// POST /auth/logout
router.post('/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('sb_token', { httpOnly: true, secure: isProd, sameSite: 'lax' });
  res.clearCookie('ac_session', { httpOnly: true, secure: isProd, sameSite: 'lax' });
  res.redirect('/login');
});

// GET /auth/me
router.get('/me', async (req, res) => {
  const token = req.cookies?.sb_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Session invalid.' });

  res.json({ email: user.email, id: user.id });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  res.cookie('sb_token', data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: data.session.expires_in * 1000
  });

  res.json({ ok: true });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('sb_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  res.redirect('/login');
});

// GET /auth/me — returns current user info (used by frontend to verify session)
router.get('/me', async (req, res) => {
  const token = req.cookies?.sb_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Session invalid.' });

  res.json({ email: user.email, id: user.id });
});

module.exports = router;

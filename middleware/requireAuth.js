const supabase = require('../config/supabase');

module.exports = async function requireAuth(req, res, next) {
  // Prevent browsers from caching protected responses
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const sbToken =
    req.cookies?.sb_token ||
    req.headers.authorization?.replace('Bearer ', '');
  const acSession = req.cookies?.ac_session;

  // ── Supabase email session ────────────────────────────────────────────────
  if (sbToken) {
    const { data: { user }, error } = await supabase.auth.getUser(sbToken);
    if (!error && user) {
      const { data: profile } = await supabase.admin
        .from('profiles')
        .select('id, role, company_id, first_name, last_name, is_active')
        .eq('user_id', user.id)
        .single();

      // Deny revoked accounts
      if (profile && profile.is_active === false) {
        res.clearCookie('sb_token', { httpOnly: true, sameSite: 'lax' });
        return deny(req, res);
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: profile?.role || 'employee',
        companyId: profile?.company_id,
        profileId: profile?.id,
        firstName: profile?.first_name,
        lastName: profile?.last_name,
        sessionType: 'supabase'
      };
      return next();
    }
    res.clearCookie('sb_token', { httpOnly: true, sameSite: 'lax' });
  }

  // ── Access code session ───────────────────────────────────────────────────
  if (acSession) {
    const { data: profile, error } = await supabase.admin
      .from('profiles')
      .select('id, role, company_id, first_name, last_name, expires_at, is_active')
      .eq('id', acSession)
      .single();

    if (
      !error &&
      profile &&
      profile.is_active &&
      (!profile.expires_at || new Date(profile.expires_at) > new Date())
    ) {
      req.user = {
        id: profile.id,
        role: profile.role || 'employee',
        companyId: profile.company_id,
        profileId: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        sessionType: 'access_code'
      };
      return next();
    }
    res.clearCookie('ac_session', { httpOnly: true, sameSite: 'lax' });
  }

  return deny(req, res);
};

function deny(req, res) {
  // JSON clients get 401 instead of a redirect
  if (req.headers.accept?.includes('application/json') ||
      req.headers['content-type']?.includes('application/json')) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  return res.redirect('/login');
}

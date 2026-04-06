const supabase = require('../config/supabase');

module.exports = async function requireAuth(req, res, next) {
  const token =
    req.cookies?.sb_token ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.redirect('/login');
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.clearCookie('sb_token');
    return res.redirect('/login');
  }

  req.user = user;
  next();
};

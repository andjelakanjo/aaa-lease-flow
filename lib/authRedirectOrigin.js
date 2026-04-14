/**
 * Base URL used in Supabase Auth redirectTo (invite, recovery, forgot-password).
 * Set AUTH_REDIRECT_ORIGIN in Vercel (e.g. https://your-prod-domain.com) when preview
 * deployments use Vercel SSO / deployment protection — it strips the #access_token…
 * fragment after login, so password links must land on an origin that is not intercepted.
 */
function getAuthRedirectOrigin(req) {
  const fromEnv = process.env.AUTH_REDIRECT_ORIGIN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`.replace(/\/$/, '');
}

module.exports = { getAuthRedirectOrigin };

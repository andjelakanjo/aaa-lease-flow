const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// GET / — redirect to the appropriate destination based on role
router.get('/', (req, res) => {
  const role = req.user?.role;
  if (role === 'super_admin' || role === 'admin') {
    return res.redirect('/admin');
  }
  return res.redirect('/app');
});

// GET /app — main application (all authenticated employees see this)
// Injects window.__USER_ROLE__ and window.__PREVIEW_MODE__ so the frontend can adapt.
// ?preview=true forces role to 'employee' and signals the app to hide its own header.
router.get('/app', (req, res) => {
  const isPreview = req.query.preview === 'true';
  const role = isPreview ? 'employee' : (req.user?.role || 'employee');
  const appPath = path.join(__dirname, '..', 'public', 'app.html');
  const html = fs.readFileSync(appPath, 'utf-8');
  const injected = html.replace(
    '<head>',
    `<head><script>window.__USER_ROLE__ = ${JSON.stringify(role)};window.__PREVIEW_MODE__ = ${JSON.stringify(isPreview)};</script>`
  );
  res.set('Content-Type', 'text/html');
  res.send(injected);
});

module.exports = router;

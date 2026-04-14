const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

function loadAppHtml() {
  const appPath = path.join(__dirname, '..', 'public', 'app.html');
  return fs.readFileSync(appPath, 'utf-8');
}

function extractInlineScriptFromAppHtml(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  return m?.[1] || null;
}

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
  const html = loadAppHtml();

  // Replace the big inline <script> block with a separate request.
  // This lets us drop 'unsafe-inline' for scriptSrc later (event handlers still use scriptSrcAttr).
  const htmlWithoutInlineScript = html.replace(
    /<script>[\s\S]*?<\/script>/,
    '<script src="/app-inline.js" defer></script>'
  );

  const injected = htmlWithoutInlineScript.replace(
    '<head>',
    `<head><script>window.__USER_ROLE__ = ${JSON.stringify(role)};window.__PREVIEW_MODE__ = ${JSON.stringify(isPreview)};</script>`
  );
  res.set('Content-Type', 'text/html');
  res.send(injected);
});

// GET /app-inline.js — serves the original inline JS from public/app.html
router.get('/app-inline.js', (req, res) => {
  const html = loadAppHtml();
  const script = extractInlineScriptFromAppHtml(html);
  if (!script) return res.status(404).send('Not found.');
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.send(script);
});

module.exports = router;

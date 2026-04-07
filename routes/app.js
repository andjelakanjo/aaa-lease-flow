const express = require('express');
const router = express.Router();
const path = require('path');

// GET / — redirect to the appropriate destination based on role
router.get('/', (req, res) => {
  const role = req.user?.role;
  if (role === 'super_admin' || role === 'admin') {
    return res.redirect('/admin');
  }
  return res.redirect('/app');
});

// GET /app — main application (all authenticated employees see this)
// Company-specific content routing will be added here in the future.
router.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

module.exports = router;

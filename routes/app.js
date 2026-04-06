const express = require('express');
const router = express.Router();
const path = require('path');

// Serve the main app — protected by requireAuth middleware in server.js
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

module.exports = router;

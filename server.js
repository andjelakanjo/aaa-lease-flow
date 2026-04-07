require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/app');

const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https://*.supabase.co'],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"]
      }
    }
  })
);

app.use(express.json());
app.use(cookieParser());

// ── Public routes (no auth required) ────────────────────────────────────────

// Auth endpoints — stricter rate limit
app.use('/auth', authLimiter, authRoutes);

// Login page — redirect to app if already authenticated
app.get('/login', (req, res) => {
  if (req.cookies?.sb_token) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ── Protected routes ─────────────────────────────────────────────────────────

app.use(apiLimiter);
app.use(requireAuth);
app.use('/', appRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).send('Not found.');
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AAA Lease running on http://localhost:${PORT}`);
});

module.exports = app;

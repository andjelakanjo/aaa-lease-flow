require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/app');
const adminRoutes = require('./routes/admin');

const app = express();

// Trust Vercel's proxy (fixes X-Forwarded-For ValidationError)
app.set('trust proxy', 1);

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

// ── Public routes ─────────────────────────────────────────────────────────────

app.use('/auth', authLimiter, authRoutes);

app.get('/login', (req, res) => {
  // If either session cookie is present, let the protected route handle the redirect
  if (req.cookies?.sb_token || req.cookies?.ac_session) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ── Protected routes ──────────────────────────────────────────────────────────

app.use(apiLimiter);
app.use(requireAuth);
app.use('/admin', adminRoutes);
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

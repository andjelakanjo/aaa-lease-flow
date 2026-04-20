require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const { randomUUID } = require('crypto');
const logger = require('./lib/logger');
const pinoHttp = require('pino-http');

const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/app');
const adminRoutes = require('./routes/admin');
const usersRoutes = require('./routes/users');
const implementationRoutes = require('./routes/implementation');
const proposalRoutes = require('./routes/proposal');
const preferencesRoutes = require('./routes/preferences');

const app = express();

// Trust Vercel's proxy (fixes X-Forwarded-For ValidationError)
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Disallow inline <script> blocks (we serve JS as files).
        scriptSrc: ["'self'"],
        // Disallow inline event handlers (onclick=..., oninput=..., etc).
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https://*.supabase.co'],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Admin embeds /app?preview=true in an iframe on the same origin.
        frameAncestors: ["'self'"]
      }
    }
  })
);

app.use(express.json());
app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
    genReqId(req, res) {
      const id = req.headers['x-request-id'] || randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    }
  })
);

// ── Public routes ─────────────────────────────────────────────────────────────

// Serve public JS assets (login/admin/app scripts).
// We intentionally keep HTML behind explicit routes/middleware.
app.get(/^\/[a-zA-Z0-9._-]+\.js$/, (req, res, next) => {
  const safeName = path.basename(req.path);
  res.sendFile(path.join(__dirname, 'public', safeName), (err) => {
    if (err) next();
  });
});

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
app.use('/admin/api/users', usersRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/implementation', implementationRoutes);
app.use('/api/proposal', proposalRoutes);
app.use('/', appRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).send('Not found.');
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'AAA Lease server listening');
  });
}

module.exports = app;

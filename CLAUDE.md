# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start with nodemon (auto-reload)
npm start            # production start
npm test             # API smoke tests (node:test + supertest)

docker compose up --build   # run with Docker
```

No build step — the frontend is plain HTML/CSS/JS.

## Supabase migrations (implementation / onboarding tables)

Before **Implementacija** and related `/api/implementation` features work against a Supabase project, apply the SQL migration once on that project:

- File: [`supabase/migrations/20260414120000_implementation_onboarding.sql`](supabase/migrations/20260414120000_implementation_onboarding.sql)

Use the Supabase dashboard **SQL Editor** (paste and run), or `supabase db push` / your migration pipeline if you use the Supabase CLI linked to the project. If tables are missing, PostgREST returns errors like `Could not find the table 'public.vendors' in the schema cache`.

## Architecture

**Express + Supabase auth, single-page HTML frontend.**

```
server.js              # Express entry point — Helmet, rate limiting, route wiring
config/supabase.js     # Supabase server-side client (reads from .env)
middleware/
  requireAuth.js       # Validates sb_token httpOnly cookie; redirects to /login on failure
  rateLimiter.js       # Two limiters: authLimiter (10 req/15min) for /auth, apiLimiter (100/15min) for everything else
routes/
  auth.js              # POST /auth/login, POST /auth/logout, GET /auth/me
  app.js               # GET / — serves public/app.html (protected)
public/
  login.html           # Login form — fetch POSTs to /auth/login, sets httpOnly cookie via backend
  app.html             # Main app (moved from index.html) — all logic is inline JS/CSS
```

## Auth Flow

1. User hits any route → `requireAuth` middleware checks for `sb_token` cookie
2. If missing/invalid → redirect to `/login`
3. Login form POSTs `{email, password}` to `POST /auth/login`
4. Backend calls `supabase.auth.signInWithPassword`, receives session
5. Backend sets `sb_token` httpOnly cookie (secure in production)
6. Subsequent requests carry the cookie; middleware calls `supabase.auth.getUser(token)` to validate
7. Logout: `POST /auth/logout` clears cookie → redirect to `/login`

The Supabase JS SDK is **not** loaded on the frontend. All Supabase calls are made server-side via `config/supabase.js`.

## Frontend App Architecture (public/app.html)

Everything is inline in a single HTML file (~1700 lines):

- **CSS variables** at `:root`: `--bg`, `--surface`, `--accent`, `--ops` (orange), `--acc` (blue), `--sales` (purple), `--mgmt` (green)
- **Seven view panels** toggled by `switchView(id)`: `#map-view`, `#flow-view`, `#procmap-view`, `#docs-view`, `#reqs-view`, `#glossary-view`, `#quiz-view`
- **Slide-in detail panel** `#detail-panel` opened by `openPanel(personId)`
- **Key data objects** in the `<script>` block:
  - `T` — bilingual strings `{sr:'...', en:'...'}`; applied by `applyTranslations()` via `data-t` attributes
  - `PEOPLE` — keyed by person ID; each entry has `name`, `role`, `dept`, `summary`, `processes`, `docs`, `tools`, `connects`, `pains` — all with `sr`/`en` variants
  - `DOCS` — rendered dynamically by `renderDocs()`; `owners` are PEOPLE keys
  - `REQUIREMENTS` — grouped by module; rendered by `renderReqs()`; `who` are PEOPLE keys
  - `GLOSSARY` — rendered by `renderGlossary()`; `cat`: `lease` | `acc` | `ops`
  - `QUIZ_QUESTIONS` — `type`: `role` | `process`; driven by `startQuiz()` / `nextQuestion()`
- **Language state**: `let LANG = 'sr'` (Serbian default); `setLang('en')` re-renders all dynamic views
- **Bilingual pattern**: `data.field[LANG] || data.field.en`

**Static views** (Team Map, Process Flow, Process Map) are hard-coded HTML — edit directly in the file.  
**Dynamic views** (Docs, Requirements, Glossary) render from JS data arrays — edit the arrays.

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `PORT` | Server port (default 3000) |
| `NODE_ENV` | `development` or `production` (affects cookie `secure` flag) |
| `LOG_LEVEL` | Optional. Pino log level (e.g. `debug`, `info`, `silent`). Defaults to `silent` in `NODE_ENV=test`, otherwise `info` in production and `debug` in development. |

## Deployment

**Vercel**: `vercel.json` routes all traffic through `server.js` via `@vercel/node`. Set env vars in the Vercel dashboard.

**Docker**: `docker compose up --build`. Reads `.env` via `env_file`.

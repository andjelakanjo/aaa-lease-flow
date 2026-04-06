# AAA Lease — Process Map

Internal web tool for the AAA Lease team. Maps team roles, end-to-end processes, key documents, software requirements, and a glossary — with bilingual Serbian/English support.

## Stack

- **Backend**: Node.js + Express
- **Auth**: Supabase (email/password, server-side httpOnly cookie session)
- **Security**: Helmet.js, express-rate-limit
- **Frontend**: Vanilla HTML/CSS/JS (single file, no build step)
- **Deploy**: Vercel or Docker

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials (already pre-filled for this project)

# 3. Run
npm run dev       # development (nodemon)
npm start         # production
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the login page.

## Docker

```bash
docker compose up --build
```

## Vercel

```bash
npm i -g vercel
vercel
```

Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `NODE_ENV=production` in the Vercel dashboard.

## Adding users

Create users via the [Supabase Dashboard](https://supabase.com/dashboard) → Authentication → Users → Invite user. Only invited users can log in.

## Routes

| Route | Auth | Description |
|---|---|---|
| `GET /login` | Public | Login page |
| `POST /auth/login` | Public | Exchange credentials for session cookie |
| `POST /auth/logout` | Public | Clear session cookie |
| `GET /auth/me` | Public | Return current user info |
| `GET /` | Protected | Main process map app |

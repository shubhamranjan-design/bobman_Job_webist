# BobmanConnect

Two products in one repo:

| Product | Path | Public URL | Purpose |
|---|---|---|---|
| **Recruiter Dashboard** | `bobman_website/` | `https://api.bobmanconnect.com/dashboard/` | Internal analytics & user-lookup dashboard for our recruiter team |
| **SaaS Talent Portal** | `bobman_saas/` | `https://api.bobmanconnect.com/home/` | External company-facing portal — companies browse pre-screened robotics candidates, listen to AI screening calls, unlock contact details with credits |

## Architecture

```
              ┌──────────────────────────────────────────────────┐
              │      api.bobmanconnect.com  (nginx + LE SSL)     │
              └─────┬─────────────────┬──────────────────────────┘
                    │                 │
   ┌────────────────▼────────┐   ┌────▼─────────────────────────┐
   │  /dashboard/            │   │  /home/                      │
   │  (recruiter dashboard)  │   │  (SaaS portal — companies)   │
   │  React+Vite (port 3001) │   │  React SPA served by nginx   │
   │                         │   │                              │
   │  /dashboard/api/*       │   │  /home/api/*                 │
   │  FastAPI (port 8000)    │   │  FastAPI (port 8001)         │
   │  → Supabase (read/write)│   │  → SQLite (saas.db)          │
   │                         │   │  → Supabase (read-only)      │
   └─────────────────────────┘   └──────────────────────────────┘
```

Both backends read candidate data from the same **Supabase** Postgres (`users`, `conversations`, `whatsapp_conversations`, `candidate_jd_matches`, `top_matches_dashboard`, `jd_data`, `screening_sessions`, `audit_log`). The SaaS portal additionally has a local **SQLite** database for SaaS-specific tables (companies, credits, unlocks, candidate-pitch cache).

## Recruiter Dashboard (`bobman_website/`)

### Backend (`bobman_website/backend/`)
- **Stack**: FastAPI + uvicorn (2 workers, port 8000), supabase-py
- **Entry**: `main.py`
- **Routes**:
  - `routes/dashboard.py` — raw data endpoints (users/whatsapp/calls/matches/jds/emails) used by the legacy HTML dashboard
  - `routes/summary_api.py` — aggregated summary endpoints (`/summary`, `/summary/filters`, `/summary/compare`) used by the React dashboard
  - `routes/screening_api.py` — screening session summary
  - `routes/user_lookup_api.py` — user search, lookup detail, recruiter pivot, feedback/comments PATCH, ElevenLabs audio proxy
- **Resilience**: `database.py` wraps supabase-py with auto-retry on stale connection errors

### Frontend
- `frontend/` — legacy plain-HTML dashboard (still served as a fallback / debug view)
- `frontend-react/` — modern React + Vite SPA (this is the primary dashboard)
- `frontend-react/server.js` — Node.js static server (port 3001) that also proxies `/dashboard/api/*` to backend port 8000

### Local dev
```bash
# Backend
cd bobman_website/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in real values
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Frontend (React)
cd bobman_website/frontend-react
npm install
npm run dev            # vite dev with /api proxy → 8000
# or production
npm run build
node server.js
```

## SaaS Talent Portal (`bobman_saas/`)

### Backend (`bobman_saas/backend/`)
- **Stack**: FastAPI + uvicorn (port 8001), SQLAlchemy (SQLite), supabase-py, OpenRouter LLM
- **Entry**: `main.py`
- **Routes**:
  - `routes/auth_routes.py` — POST `/login`, GET `/me` (JWT auth)
  - `routes/admin.py` — POST `/admin/companies` (token-gated)
  - `routes/roles.py` — list roles, AI fuzzy search (OpenRouter), per-role detail, candidate list (top N, internal stage labels stripped)
  - `routes/candidates.py` — full candidate detail with AI fit summary, profile, work history, education, skills, navigation (prev/next)
  - `routes/unlock.py` — atomic credit decrement to reveal phone/email
  - `routes/audio.py` — ElevenLabs screening-call audio proxy
- **LLM** (`llm.py`): OpenRouter calls for (a) role-to-query fuzzy matching with in-memory cache, (b) per-candidate fit pitch generation with SQLite cache
- **Models** (`models.py`): companies, unlocks, role_views, candidate_pitches
- **Seed company** (`seed_company.py`): CLI to manually create company accounts

### Frontend (`bobman_saas/frontend/`)
- **Stack**: React 18 + Vite + React Router
- **Pages**:
  - `pages/LandingPage.jsx` — public marketing home
  - `pages/ServicesPage.jsx`, `pages/AboutPage.jsx`
  - `pages/LoginPage.jsx`
  - `pages/RolesPage.jsx` — role grid + AI search
  - `pages/RoleDetailPage.jsx` — JD details + candidate list with "see more" pagination
  - `pages/CandidateDetailPage.jsx` — contact reveal at top, AI fit summary, AI candidate insights (cumulative summary), inline call player, work history, education, skills
- **Shells**: `MarketingShell.jsx` (public nav + footer), `DashboardShell.jsx` (auth'd header)
- **Theme**: light + dark mode via CSS variables, persisted to `localStorage`

### Local dev
```bash
cd bobman_saas/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in real values
./venv/bin/python seed_company.py "Demo Co" demo@co.com password123 10
uvicorn main:app --host 127.0.0.1 --port 8001 --reload

cd ../frontend
npm install
npm run dev            # vite dev with /api proxy → 8001
# or production
npm run build
```

## Deployment notes (production)
- **Nginx**: `/etc/nginx/sites-available/shortlink` — single server block for `api.bobmanconnect.com` with location blocks for `/dashboard/`, `/dashboard/api/`, `/home/`, `/home/api/`, `/canscrap/*` and the root shortlink service. SaaS frontend is served as static `alias /home/ubuntu/bobman_saas/frontend/dist/`
- **SSL**: Let's Encrypt via certbot. Renewal hooks in `/etc/letsencrypt/renewal-hooks/{pre,post}/` stop/start n8n on port 80
- **systemd services**:
  - `bobman-api.service` — recruiter dashboard backend (port 8000)
  - `bobman-react.service` — recruiter dashboard frontend node server (port 3001)
  - `bobman-saas-api.service` — SaaS backend (port 8001)

## Security
- `.env` files are git-ignored. Copy `.env.example` and fill in real values locally
- SaaS uses JWT for company auth and a separate `ADMIN_TOKEN` for admin endpoints
- Supabase service-role key is used server-side only

## Tech stack summary
- **Backend**: Python 3.12, FastAPI, uvicorn, supabase-py, SQLAlchemy (SaaS only), PyJWT, bcrypt, httpx
- **Frontend**: React 18, Vite, React Router (SaaS), vite-plugin-pwa (dashboard)
- **Data**: Supabase (Postgres) for candidate data, SQLite for SaaS-local tables
- **AI**: OpenRouter (Claude 3.5 Haiku) for pitch + role-match
- **Audio**: ElevenLabs Conversational AI (transcripts + recording playback)

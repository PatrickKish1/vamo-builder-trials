# Backend (Express + Supabase)

Express API for the VibeCoder stack. Uses Supabase for auth and database (RLS only, no service role). See `docs/BACKEND_MIGRATION_PLAN.md` for the full migration plan.

## Setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set:

   - `SUPABASE_URL` – your Supabase project URL
   - `SUPABASE_ANON_KEY` – anon (public) key only
   - `PORT` – default `4000`
   - Optionally: `FRONTEND_ORIGIN`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`

3. **Run**

   ```bash
   pnpm dev    # development (tsx watch)
   pnpm build  # compile to dist/
   pnpm start  # run dist/index.js
   pnpm test   # unit tests
   pnpm lint   # ESLint
   ```

## API (versioned under `/api/v1`)

All routes are versioned under **`/api/v1`** for future scaling (e.g. `/api/v2` later).

- `GET /api/v1/health` – health check
- `POST /api/v1/auth/login` – email/password login
- `POST /api/v1/auth/signup` – signup
- `GET /api/v1/auth/session` – session check (Bearer token)
- `POST /api/v1/auth/logout` – logout
- `GET|POST|PUT|DELETE /api/v1/projects` – IDE projects (list, create, update, delete)
- `GET|POST /api/v1/files`, `POST /api/v1/files/upload` – project files (upload returns 501 for now)
- `POST|GET /api/v1/chat` – AI code generation (LangChain), conversation history
- `POST|GET /api/v1/thread` – create thread, get thread
- `GET /api/v1/realtime` – SSE stream (file events)
- `GET|POST /api/v1/builder/projects`, `GET|POST /api/v1/builder/auth-check`, `POST /api/v1/builder/scaffold`, `POST /api/v1/builder/preview/start`
- **E2B IDE sandbox** (requires `E2B_API_KEY`): `POST /api/v1/sandbox/create` (projectId, optional templateId), `POST /api/v1/sandbox/sync` (projectId; syncs project_files to sandbox), `POST /api/v1/sandbox/run` (projectId, command), `GET /api/v1/sandbox/preview?projectId=&port=3000`, `POST /api/v1/sandbox/kill`, `GET /api/v1/sandbox/suggest-commands?projectId=` (install/run hints by language)
- `POST /api/v1/github/import`, `GET /api/v1/github/branches` – 501 stubs
- `GET /api/v1/voices`, `POST /api/v1/voices/select` – 501 stubs
- `GET /api/v1/tools/list`, `POST /api/v1/tools/create` – 501 stubs
- `GET /api/v1/mcp/list`, `POST /api/v1/mcp/create`, `PUT /api/v1/mcp/update` – 501 stubs
- `POST /api/v1/webhooks/elevenlabs`, `POST /api/v1/webhooks/elevenlabs/code-generation`
- `POST /api/v1/cleanup/playground` – 501 stub

Legacy unversioned routes under `/api` (health, auth) are still mounted for backward compatibility; prefer `/api/v1/*` for new use.

## Database (Supabase)

Migrations live in `supabase/migrations/`. Apply them via the Supabase dashboard (SQL Editor) or [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Order: `001_profiles.sql` → `002_projects.sql` → `003_project_files.sql` → `004_builder_projects.sql` → `005_triggers.sql`.

**OAuth (Google, GitHub):** Enable in Supabase Dashboard → Authentication → Providers. No backend callback required if the frontend uses `supabase.auth.signInWithOAuth()` and handles the redirect.

## Structure

- `src/config` – env, Supabase client
- `src/middleware` – auth (optional/require), error handler
- `src/routes` – route modules (mount under `/api`)
- `src/controllers` – auth, (projects, files, … later)
- `src/services` – auth, (projects, files, … later)
- `src/types` – API and Express types
- `src/utils` – errors, validation
- `tests/unit` – unit tests (services, utils)

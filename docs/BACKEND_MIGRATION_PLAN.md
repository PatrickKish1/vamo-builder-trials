# Backend Migration Plan: Next.js → Express + Supabase

This document defines the plan to turn the `backend` from a minimal Next.js app into a standalone **Express** API using **Supabase** (auth, DB), **LangChain** (AI), with a clear **controllers / routes / services** structure and **unit tests**. The frontend will be migrated from Appwrite to this backend + Supabase.

---

## 1. Package Manager & Conventions

- **Package manager:** `pnpm` (align with existing `backend/pnpm-lock.yaml` and frontend).
- **Rules:** Follow `project.md` and `.cursor/rules` (coding-guide, test.mdc, performance.mdc):
  - No `any`; use proper types/interfaces.
  - No Prisma/Drizzle: use Supabase client and raw SQL migrations.
  - No service role key in code: anon key + user JWT + RLS only.
  - Unit tests for services/controllers; no real network/DB in unit tests; mock externals.

---

## 2. Current State Summary

### 2.1 Backend (`backend/`)

- **Current:** Minimal Next.js 16 app (single page, no API routes).
- **Goal:** Replace with Express app; remove Next.js.

### 2.2 Frontend – Backend Operations (all in `frontend/src/app/api/`)

All of these are currently implemented as Next.js API routes and must be migrated to Express and/or Supabase.

| Area | Route(s) | Method | Purpose |
|------|----------|--------|---------|
| **Auth** | `/api/auth/login` | POST | Email/password login (Appwrite) → Supabase signInWithPassword |
| | `/api/auth/signup` | POST | Create account + session (Appwrite) → Supabase signUp + session |
| | `/api/auth/session` | GET | Verify token, return user (Appwrite) → Supabase getUser(JWT) |
| | `/api/auth/logout` | POST | Invalidate session (Appwrite) → Supabase signOut |
| **Projects** | `/api/projects` | GET | List projects (optional `userId`, `projectId`) |
| | `/api/projects` | POST | Create project (name, userId, isPlayground, expiresAt, id) |
| | `/api/projects` | PUT | Update project (id, name, activeFilePath, openFilePaths, dirtyFiles) |
| | `/api/projects` | DELETE | Delete project + its files (query `id`) |
| **Files** | `/api/files` | GET | List files by projectId (optional userId, path) |
| | `/api/files` | POST | create/update/delete/rename file or folder (action, path, content, isFolder, newPath, projectId, userId, encoding, mimeType) |
| | `/api/files/upload` | POST | Multipart upload (projectId, userId, etc.) |
| **Chat / AI** | `/api/chat` | POST | Code generation (threadId, prompt, context) – uses `ai-service` (LangChain) |
| | `/api/chat` | GET | Conversation history (threadId) |
| **Thread** | `/api/thread` | POST | Create thread (returns threadId) |
| | `/api/thread` | GET | Get thread (threadId) |
| **Realtime** | `/api/realtime` | GET | SSE stream (ping + file:created/updated/renamed/deleted) |
| **Builder** | `/api/builder/projects` | GET | List builder projects (optional projectId) |
| | `/api/builder/projects` | POST | Create builder project (name, description, framework) |
| | `/api/builder/auth-check` | GET/POST | Auth check for agents (Bearer token) |
| | `/api/builder/scaffold` | POST | Scaffold project (projectId, description) – exec create-next-app etc. |
| | `/api/builder/preview/start` | POST | Start dev server (projectId) |
| | `/api/builder/build` | (referenced in tools) | Build step |
| | `/api/builder/dependencies` | (referenced in tools) | Install deps |
| **GitHub** | `/api/github/import` | POST | Import repo (zip URL, projectId, etc.) |
| | `/api/github/branches` | GET | List branches (repo URL) |
| **Voices** | `/api/voices` | GET | List ElevenLabs voices (proxy) |
| | `/api/voices/select` | POST | Select voice (agentId) – ElevenLabs |
| **Tools / MCP** | `/api/tools/list` | GET | List ElevenLabs tools |
| | `/api/tools/create` | POST | Create ElevenLabs tool |
| | `/api/mcp/list` | GET | List MCP servers (ElevenLabs) |
| | `/api/mcp/create` | POST | Create MCP server |
| | `/api/mcp/update` | PUT | Update MCP server |
| **Webhooks** | `/api/webhooks/elevenlabs` | POST | ElevenLabs webhook |
| | `/api/webhooks/elevenlabs/code-generation` | POST | Code generation webhook |
| **Cleanup** | `/api/cleanup/playground` | POST | Clean expired playground (optional key) |
| **Appwrite** | `/api/appwrite/bootstrap` | (bootstrap) | Not needed after Supabase migration |

### 2.3 Frontend – Auth Contract (to preserve)

- **Session:** `localStorage.sessionToken` = Bearer token.
- **Requests:** `Authorization: Bearer <sessionToken>`.
- **Session response:** `{ user: { id, email, name }, authenticated: true }` or `{ user: null, authenticated: false }`.
- **Login/Signup response:** `{ session: { userId, token }, user: { id, email, name } }`.

### 2.4 Data Shapes (Appwrite → Supabase mapping)

- **Projects (IDE):** id, name, userId, activeFilePath, openFilePaths[], dirtyFiles[], createdAt, updatedAt, isPlayground (derived or column), expiresAt (playground).
- **Files:** path, content, encoding, mimeType, isFolder, projectId, userId.
- **Builder projects:** id, name, description, framework, status, previewUrl, previewPort, projectPath, type='builder', userId, createdAt, updatedAt.

---

## 3. Supabase Setup

### 3.1 Auth

- **Supabase Auth** with:
  - Email/password signup and login.
  - **Google OAuth** (provider in Supabase dashboard).
  - **GitHub OAuth** (provider in Supabase dashboard; reuse for future GitHub integration).
- **Profile on signup:** Trigger `handle_new_user()` to insert into `profiles` (id, email, full_name, avatar_url from `raw_user_meta_data`).
- **Session:** Frontend will send Supabase JWT (e.g. from `supabase.auth.getSession()`) as Bearer token; backend verifies with Supabase and returns same user shape `{ id, email, name }` so AuthContext stays compatible.

### 3.2 Database Schema (VibeCoder – not full Vamo schema)

Migrations in `backend/supabase/migrations/` (or `supabase/migrations/` at repo root if shared). All tables **RLS enabled**; access only with anon key + user JWT.

- **profiles**  
  id (UUID, PK, ref auth.users), email, full_name, avatar_url, is_admin (default false), created_at, updated_at.  
  Policies: own profile SELECT/UPDATE; insert via trigger; admins SELECT all.

- **projects** (IDE projects)  
  id (UUID, PK), owner_id (ref profiles), name, active_file_path, open_file_paths (JSONB/text[]), dirty_files (JSONB/text[]), is_playground (boolean), expires_at (timestamptz, nullable), created_at, updated_at.  
  Policies: owner CRUD; optionally “public” read for playground by id if needed.

- **project_files**  
  id (UUID, PK), project_id (ref projects), path (text), content (text), encoding (text), mime_type (text), is_folder (boolean), owner_id (ref profiles, nullable for playground), created_at, updated_at.  
  Unique (project_id, path). Policies: owner or project owner can CRUD.

- **builder_projects**  
  id (UUID, PK), owner_id (ref profiles), name, description, framework, status, preview_url, preview_port, project_path, created_at, updated_at.  
  Policies: owner CRUD.

- **threads** (for LangChain chat – optional server-side persistence)  
  id (UUID, PK), owner_id (ref profiles), created_at, updated_at.  
  **thread_messages** (optional): thread_id, role, content, created_at.  
  If we keep threads in memory in backend, we can add this later.

Exact SQL (CREATE TABLE + RLS policies) to be added in implementation phase.

### 3.3 Environment

- Backend: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (no service role).
- Frontend: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; use `@supabase/supabase-js` for auth (signIn, signUp, signOut, getSession) and optionally for direct reads if we move some reads to client + RLS.

---

## 4. Express Backend Structure

```
backend/
├── package.json                 # express, supabase-js, langchain, etc.
├── pnpm-lock.yaml
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts                 # Entry: createApp(), listen()
│   ├── app.ts                   # Express app: middleware, mount routes
│   ├── config/
│   │   ├── env.ts               # Validate and expose env vars
│   │   └── supabase.ts          # Create Supabase client (anon key only)
│   ├── middleware/
│   │   ├── auth.ts              # Optional auth: verify JWT, set req.user
│   │   ├── errorHandler.ts      # Central error handler
│   │   └── validateRequest.ts   # Optional validation (e.g. zod)
│   ├── routes/
│   │   ├── index.ts             # Aggregates all routes
│   │   ├── auth.routes.ts       # /auth/login, /auth/signup, /auth/session, /auth/logout
│   │   ├── projects.routes.ts   # /projects
│   │   ├── files.routes.ts      # /files, /files/upload
│   │   ├── chat.routes.ts       # /chat, /thread
│   │   ├── realtime.routes.ts   # /realtime (SSE)
│   │   ├── builder.routes.ts    # /builder/projects, auth-check, scaffold, preview/start, etc.
│   │   ├── github.routes.ts     # /github/import, /github/branches
│   │   ├── voices.routes.ts     # /voices, /voices/select
│   │   ├── tools.routes.ts      # /tools/list, /tools/create
│   │   ├── mcp.routes.ts        # /mcp/list, /mcp/create, /mcp/update
│   │   ├── webhooks.routes.ts   # /webhooks/elevenlabs, /webhooks/elevenlabs/code-generation
│   │   └── cleanup.routes.ts    # /cleanup/playground
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── projects.controller.ts
│   │   ├── files.controller.ts
│   │   ├── chat.controller.ts
│   │   ├── thread.controller.ts
│   │   ├── realtime.controller.ts
│   │   ├── builder.controller.ts
│   │   ├── github.controller.ts
│   │   ├── voices.controller.ts
│   │   ├── tools.controller.ts
│   │   ├── mcp.controller.ts
│   │   ├── webhooks.controller.ts
│   │   └── cleanup.controller.ts
│   ├── services/
│   │   ├── auth.service.ts      # Supabase auth: login, signup, session, logout
│   │   ├── projects.service.ts  # CRUD projects (Supabase)
│   │   ├── files.service.ts    # CRUD files (Supabase)
│   │   ├── chat.service.ts      # LangChain code generation (move from frontend ai-service)
│   │   ├── thread.service.ts    # In-memory or DB threads
│   │   ├── realtime.service.ts  # SSE subscribers + broadcast
│   │   ├── builder.service.ts   # Scaffold, preview start, builder projects CRUD
│   │   ├── github.service.ts
│   │   ├── voices.service.ts    # ElevenLabs proxy
│   │   ├── tools.service.ts
│   │   ├── mcp.service.ts
│   │   └── webhooks.service.ts
│   ├── types/
│   │   ├── express.d.ts         # req.user
│   │   ├── api.types.ts         # Request/response body types
│   │   └── db.types.ts          # Supabase table types (or generated)
│   └── utils/
│       ├── errors.ts            # AppError, 400/401/404/500
│       └── pathValidation.ts    # sanitizePath, validatePath, validateExtension
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   │   ├── auth.service.test.ts
│   │   │   ├── projects.service.test.ts
│   │   │   ├── files.service.test.ts
│   │   │   ├── chat.service.test.ts
│   │   │   ├── thread.service.test.ts
│   │   │   ├── builder.service.test.ts
│   │   │   └── ...
│   │   └── utils/
│   │       └── pathValidation.test.ts
│   └── integration/             # Optional later: Controller + Service + mocked Supabase
│       └── auth.routes.test.ts
├── supabase/
│   └── migrations/
│       ├── 001_profiles.sql
│       ├── 002_projects.sql
│       ├── 003_project_files.sql
│       ├── 004_builder_projects.sql
│       └── 005_triggers.sql
└── README.md
```

- **Controllers:** Handle HTTP (req/res), parse body/query, call services, send JSON or SSE.
- **Services:** Business logic and Supabase/LangChain/ElevenLabs; no `req`/`res`. So that **unit tests** can target services with mocked Supabase/client.
- **Routes:** Map method + path to controller methods; apply auth middleware where needed.

---

## 5. LangChain in Backend

- **Dependencies:** `@langchain/core`, `@langchain/groq`, `@langchain/openai` (and any others used in frontend `ai-service`).
- **Chat service:** Port `frontend/src/lib/ai-service.ts` logic into `backend/src/services/chat.service.ts`: createThread, getConversationHistory, generateCode (same request/response shapes as current `/api/chat` and `/api/thread`).
- **Env:** `GROQ_API_KEY`, `GROQ_MODEL`, `OPENAI_API_KEY` in backend `.env`; never expose in frontend.
- **Thread storage:** Either in-memory (like current frontend) or persist in Supabase (threads + thread_messages tables) in a later phase.

---

## 6. Auth Flow (Backend + Frontend)

1. **Frontend:** Use `@supabase/supabase-js`; `supabase.auth.signInWithPassword()` / `signUp()` / `signOut()`; store session (e.g. `session.access_token`) and send as `Authorization: Bearer <access_token>`.
2. **Backend:** Middleware reads Bearer token, calls `supabase.auth.getUser(access_token)` (or equivalent), sets `req.user = { id, email, name }`. If token missing/invalid and route is protected, return 401.
3. **Session endpoint:** Backend `/auth/session` verifies token and returns `{ user, authenticated }` in the same shape as today so AuthContext works unchanged.
4. **Login/Signup:** Can remain backend proxies (backend calls Supabase auth and returns session + user) or move to frontend-only Supabase auth; if backend proxy, keep same response shape.

---

## 7. Task List (Ordered for Migration)

### Phase A – Backend foundation

- **A1** Create new Express app in `backend/`: remove Next.js (delete `next.config.ts`, `src/app/`, Postcss/Tailwind), add Express, TypeScript, ts-node or tsx for dev.
- **A2** Add `package.json` scripts: `dev` (nodemon/tsx watch), `build` (tsc), `start` (node dist), `test` (Vitest or Jest), `lint` (ESLint).
- **A3** Add folder structure: `src/config`, `middleware`, `routes`, `controllers`, `services`, `types`, `utils`; `tests/unit/services`, `tests/unit/utils`.
- **A4** Add `src/app.ts` and `src/index.ts`: CORS (allow frontend origin), `express.json()`, health route (e.g. `GET /health`), mount routes under `/api` (so frontend can keep calling `/api/...` if frontend is reverse-proxied to backend) or at root; document base URL.
- **A5** Add env config: `src/config/env.ts` – validate `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORT`; optional `GROQ_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`.
- **A6** Add Supabase client: `src/config/supabase.ts` – create client with anon key only (no service role).
- **A7** Add auth middleware: `src/middleware/auth.ts` – extract Bearer token, verify with Supabase, set `req.user`; export optionalAuth (set user or leave null) and requireAuth (401 if no user).
- **A8** Add central error handler middleware and error utils (4xx/5xx, no stack in production).

### Phase B – Supabase schema and auth

- **B1** Create `supabase/migrations/001_profiles.sql`: profiles table + RLS + trigger for new user.
- **B2** Create `002_projects.sql`: projects (IDE) table + RLS.
- **B3** Create `003_project_files.sql`: project_files table + RLS.
- **B4** Create `004_builder_projects.sql`: builder_projects table + RLS.
- **B5** Enable Google and GitHub providers in Supabase dashboard; document callback URLs and env vars for frontend.
- **B6** Implement auth service: `auth.service.ts` – signInWithPassword, signUp, getUser(session), signOut (if server-side session used); return user shape `{ id, email, name }`.
- **B7** Implement auth controller and routes: POST `/auth/login`, POST `/auth/signup`, GET `/auth/session`, POST `/auth/logout`; keep response shapes identical to current frontend expectations.
- **B8** Add optional OAuth callback route on backend if we need server-side callback (e.g. POST `/auth/callback` that exchanges code for session and returns token to frontend); otherwise OAuth can be client-only with Supabase.

### Phase C – Projects and files

- **C1** Implement `projects.service.ts`: list (by userId or projectId), create, update, delete; use Supabase from anon client with user JWT (RLS enforces ownership).
- **C2** Implement `projects.controller.ts` and `projects.routes.ts`: GET/POST/PUT/DELETE `/projects`; map query/body to service; return same JSON shapes as current API.
- **C3** Implement `files.service.ts`: list (projectId, userId, path), create/update/delete/rename (action + path, content, isFolder, newPath); path validation (reuse logic from current files route).
- **C4** Implement `files.controller.ts` and `files.routes.ts`: GET `/files`, POST `/files`; add POST `/files/upload` for multipart (use multer or similar); preserve current request/response shapes.
- **C5** Add unit tests: `projects.service.test.ts` (mock Supabase), `files.service.test.ts` (mock Supabase), `pathValidation.test.ts`.

### Phase D – Chat, thread, realtime

- **D1** Port LangChain code from `frontend/src/lib/ai-service.ts` to `chat.service.ts`: createThread, getThread, getConversationHistory, generateCode; same input/output types.
- **D2** Implement `chat.controller.ts` and `chat.routes.ts`: POST/GET `/chat`, POST/GET `/thread`; optional auth for thread ownership later.
- **D3** Implement `realtime.service.ts`: in-memory SSE subscribers, broadcast(event, data); port from `frontend/src/lib/realtime.ts`.
- **D4** Implement `realtime.controller.ts` and `realtime.routes.ts`: GET `/realtime` returns SSE stream; ensure webhook/code-generation still call broadcast so frontend receives file events.
- **D5** Add unit tests: `chat.service.test.ts` (mock LangChain), `thread.service.test.ts`, `realtime.service.test.ts`.

### Phase E – Builder

- **E1** Implement `builder.service.ts`: builder projects CRUD (Supabase); scaffold (exec create-next-app etc. in `.builder-projects/<id>`); preview start (spawn dev server, track port); same logic as current Next.js routes.
- **E2** Implement `builder.controller.ts` and `builder.routes.ts`: GET/POST `/builder/projects`, GET/POST `/builder/auth-check`, POST `/builder/scaffold`, POST `/builder/preview/start`; auth required.
- **E3** Add unit tests: `builder.service.test.ts` (mock Supabase and optionally mock exec/spawn for scaffold/preview).

### Phase F – Proxies and webhooks

- **F1** Implement `github.service.ts` and `github.controller.ts`: GET `/github/branches`, POST `/github/import` (same behavior as current routes).
- **F2** Implement `voices.service.ts` and `voices.controller.ts`: GET `/voices`, POST `/voices/select` (ElevenLabs proxy); require auth if desired.
- **F3** Implement `tools.service.ts` and `mcp.service.ts` + controllers: list/create/update for ElevenLabs tools and MCP servers.
- **F4** Implement `webhooks.controller.ts`: POST `/webhooks/elevenlabs`, POST `/webhooks/elevenlabs/code-generation`; call realtime broadcast on code-generation so frontend SSE receives updates.
- **F5** Implement `cleanup.controller.ts`: POST `/cleanup/playground` (optional key); service to delete expired playground projects/files.
- **F6** Add unit tests for any non-trivial service logic (e.g. GitHub import, webhook payload parsing).

### Phase G – Frontend migration

- **G1** Add `@supabase/supabase-js` to frontend; create `lib/supabase.ts` (client with anon key); add env vars.
- **G2** Switch AuthContext to Supabase: signInWithPassword, signUp, getSession, signOut; store `session.access_token` as sessionToken; keep same AuthContext interface (user, login, signup, logout, sessionToken).
- **G3** ~~Add Google and GitHub sign-in in UI~~ **Done.** LoginDialog has Google/GitHub buttons calling `supabase.auth.signInWithOAuth`; redirect uses app origin + pathname; AuthContext syncs session on return via `getSession()` and `onAuthStateChange`. Ensure Supabase Dashboard > Authentication > URL Configuration includes your app redirect URL (e.g. `http://localhost:3000`).
- **G4** Point frontend API base URL to Express backend (env `NEXT_PUBLIC_API_URL` or proxy in next.config to backend); ensure all `fetch('/api/...')` become `fetch(\`${API_URL}/api/...\`)` or use proxy so paths stay `/api/...`.
- **G5** Remove Appwrite from frontend: delete `lib/appwrite.client.ts`, `lib/appwrite.ts`, `lib/auth-client.ts`; remove `node-appwrite` and `appwrite` from package.json; remove `/api/appwrite/bootstrap`.
- **G6** Remove Next.js API routes from frontend: delete `src/app/api/*` (or keep only a small proxy if needed); ensure every call goes to Express.
- **G7** Update any remaining references to Appwrite (e.g. env vars) in frontend; test auth, projects, files, chat, thread, realtime, builder, GitHub, voices, tools, webhooks end-to-end.

### Phase H – Polish and tests

- **H1** Add integration tests (optional): e.g. auth.routes.test.ts with supertest and mocked Supabase.
- **H2** Document backend: README (setup, env, run, test); document API (list of routes and request/response shapes).
- **H3** Ensure backend runs in Docker or on a host that can run Node and exec (for builder scaffold/preview); document deployment.

---

## 7b. IDE storage & versioning strategy

**Base storage (where we write first):** Use **Supabase** as the primary store. File content lives in the **`project_files`** table (Postgres). This is free, scalable for typical IDE files (many small/medium text files), and already implemented with RLS. For very large or binary files we can later add **Supabase Storage** (bucket per project or shared with path prefix) or **Git LFS** when syncing to GitHub.

- **Supabase DB (`project_files`):** Best option for the “working copy” – no per-file storage limit like buckets; free tier generous for DB; single source of truth for “current state”; fast reads/writes.
- **Supabase Storage:** Use only if we need large binaries or want to offload big assets; free tier 1GB. No built-in versioning (object versioning is plan-dependent).
- **Conclusion:** Keep **Supabase DB as base storage**. Add Supabase Storage only if we introduce large/binary file support. No need for another “free scalable place” – Supabase is the right base.

**Versioning (diffs, revert, undo):** Add **GitHub** as a versioning layer. Use the project’s GitHub org; create **one private repo per IDE project** when the user enables versioning. Store `github_repo_full_name` (e.g. `org/repo-name`) and optionally `github_sync_enabled` on the **projects** table. Flow:

1. **Write path:** Editor/agent writes to Supabase (`project_files`) first – this remains the working copy.
2. **Sync to GitHub:** On “Commit” (or on save, configurable) backend pushes current file set to the project’s private repo (GitHub API or `git` CLI with token). Commits create history.
3. **Revert/undo:** “Revert to commit X” or “Undo last agent change” = fetch file(s) at that commit from GitHub and write back to `project_files`. Alternatively “restore project to commit” by bulk pull into Supabase.
4. **Large files:** Use **Git LFS** in that repo if we need to push large files; store LFS pointers in repo, content in LFS.

Backend needs: GitHub token (org-level or app); create repo on “enable versioning”; commit+push on sync; endpoint to list commits / get file at commit for revert. This is implemented after frontend migration (Phase F GitHub service can be extended from “import repo” to “create repo + sync + revert”).

---

## 7c. Multi-agent (model selection in chat)

The chat API uses LangChain with **Groq** and **OpenAI**. To support multiple agents/models from the frontend (user selects which agent does the coding), the **request body** to `POST /api/v1/chat` must specify which model to use. Backend will use that for the call only (no global switch).

- **Request body:** Add optional `model` (e.g. `"groq"` | `"openai"`) or `agentId` (string mapped to model). If omitted, keep current default (e.g. Groq with OpenAI fallback on tool_use).
- **Implementation:** In `chat.service.ts`, accept `model` in `CodeGenerationRequest`; in `generateCode()` select `getGroqModel()` or `getOpenAIModel()` (or future agents) from that field. No global `useGroq` for per-request choice.

---

## 7d. E2B – IDE execution (run in browser, multi-language, terminal, preview URL)

We do **not** run git or heavy tooling on the host; instead we use **E2B** cloud sandboxes so that:

- **Files** live in Supabase (`project_files`); after save we **sync** them into an E2B sandbox.
- **Execution** happens inside the sandbox: pnpm/yarn/bun, node, python, java, rust, go, solidity, etc.
- **Terminal** output is shown in the IDE via commands run in the sandbox (streaming or one-shot).
- **Preview URL** for backends/servers: E2B exposes ports via `sandbox.getHost(port)` so the frontend can open a link to the dev server (e.g. Next.js on 3000).

**Flow:**

1. **Create sandbox** – `POST /api/v1/sandbox/create` (projectId, optional templateId). Backend creates an E2B sandbox (default or custom template), stores projectId → sandboxId (in-memory or DB).
2. **Sync files** – After user saves, frontend calls `POST /api/v1/sandbox/sync` (projectId). Backend reads `project_files` for that project and writes all files into the sandbox (e2b `files.write`).
3. **Run command** – `POST /api/v1/sandbox/run` (projectId, command). Backend runs the command in the sandbox and returns stdout, stderr, exitCode (and optionally streams output for terminal UI).
4. **Preview URL** – `GET /api/v1/sandbox/preview?projectId=…&port=3000`. Backend returns the public URL for that port (`getHost(port)`), so the frontend can show “Open preview” or embed iframe.
5. **Kill sandbox** – `POST /api/v1/sandbox/kill` (projectId). Frees the E2B sandbox.

**Multi-language / package manager:**

- **Primary PM:** pnpm (with fallbacks: yarn, bun). Install command: `pnpm install` (or `yarn` / `bun install` if we detect lockfile).
- **Language detection:** From project files (e.g. `package.json` → Node/TS, `requirements.txt` → Python, `Cargo.toml` → Rust, `go.mod` → Go, etc.). Backend can expose **suggested install/run commands** (e.g. `GET /api/v1/sandbox/suggest-commands?projectId=…`) so the IDE knows what to run.
- **Install/run script:** Either a single “run” that runs install + start, or separate “install” and “run” so the user can run them from the terminal UI. Terminal displays results of whatever command is run.

**Backend:**

- **Env:** `E2B_API_KEY` (required for E2B routes).
- **Service:** `sandbox.service.ts` – create, sync (accept file list from controller; controller gets files from files.service), run, getPreviewUrl, kill. Use in-memory map projectId → sandboxId (later persist in DB for reattach).
- **Templates (optional):** Custom E2B templates with preinstalled runtimes (Node, Python, Java, etc.) for faster cold start; otherwise use default template and install on first run.

---

## 8. API Base URL and CORS

- **Option A:** Frontend and backend on same origin (e.g. Next.js rewrites in `next.config`: `/api/*` → `http://localhost:4000/api/*`). Then frontend keeps `fetch('/api/...')`.
- **Option B:** Frontend uses `NEXT_PUBLIC_API_URL=http://localhost:4000` and `fetch(\`${process.env.NEXT_PUBLIC_API_URL}/api/...\`)`. Backend must set CORS to allow frontend origin.
- Recommend **Option B** for clarity and separate deploy; add CORS middleware in Express for frontend origin.

---

## 9. Testing Standards (from .cursor/rules/test.mdc)

- Unit tests: Jest or Vitest; co-located or `tests/unit/`; mock all externals (Supabase, LangChain, ElevenLabs, exec).
- Naming: `[filename].test.ts` or `[filename].spec.ts`; descriptions in plain English.
- No real network or DB in unit tests; integration tests use test DB or mocks.
- Controllers: test via integration (supertest) with mocked services if needed; focus unit tests on **services** and **utils**.

---

## 10. Summary Checklist

- [ ] Backend is Express with controllers/routes/services.
- [ ] Supabase: profiles, projects, project_files, builder_projects; RLS only; no service role.
- [ ] Auth: Supabase email/password + Google + GitHub; session = JWT in Authorization header; response shape unchanged.
- [ ] LangChain in backend; chat and thread APIs preserved.
- [ ] All current frontend API operations implemented in Express; same request/response contracts.
- [ ] Unit tests for services (and utils); optional integration tests for routes.
- [ ] Frontend migrated to Supabase auth and backend API; Appwrite and Next.js API routes removed.

This plan is the single source of truth for the migration. Tackle tasks in order (A → B → C → …); we can start with Phase A in the next prompt.

---

## 11. Numbered Task Index (for tracking)

| # | Task ID | Description |
|---|---------|--------------|
| 1 | A1 | Replace backend with Express; remove Next.js |
| 2 | A2 | Add scripts: dev, build, start, test, lint |
| 3 | A3 | Create folder structure (config, middleware, routes, controllers, services, types, utils, tests) |
| 4 | A4 | Express app + CORS + health + route mounting |
| 5 | A5 | Env config (Supabase, PORT, optional AI/ ElevenLabs keys) |
| 6 | A6 | Supabase client (anon key only) |
| 7 | A7 | Auth middleware (optional + require) |
| 8 | A8 | Error handler + error utils |
| 9 | B1 | Migration: profiles + RLS + trigger |
| 10 | B2 | Migration: projects (IDE) |
| 11 | B3 | Migration: project_files |
| 12 | B4 | Migration: builder_projects |
| 13 | B5 | Supabase dashboard: Google + GitHub OAuth |
| 14 | B6 | Auth service (Supabase auth) |
| 15 | B7 | Auth controller + routes (login, signup, session, logout) |
| 16 | B8 | OAuth callback route (if server-side) |
| 17 | C1 | Projects service (Supabase CRUD) |
| 18 | C2 | Projects controller + routes |
| 19 | C3 | Files service (CRUD + path validation) |
| 20 | C4 | Files controller + routes + upload |
| 21 | C5 | Unit tests: projects, files, pathValidation |
| 22 | D1 | Chat service (port LangChain from frontend) |
| 23 | D2 | Chat + thread controller + routes |
| 24 | D3 | Realtime service (SSE) |
| 25 | D4 | Realtime controller + routes |
| 26 | D5 | Unit tests: chat, thread, realtime |
| 27 | E1 | Builder service (CRUD, scaffold, preview) |
| 28 | E2 | Builder controller + routes |
| 29 | E3 | Unit tests: builder |
| 30 | F1 | GitHub service + controller + routes |
| 31 | F2 | Voices service + controller + routes |
| 32 | F3 | Tools + MCP services + controllers + routes |
| 33 | F4 | Webhooks controller (ElevenLabs + code-generation + broadcast) |
| 34 | F5 | Cleanup controller + service |
| 35 | F6 | Unit tests: GitHub, webhooks (as needed) |
| 36 | G1 | Frontend: Supabase client + env |
| 37 | G2 | Frontend: AuthContext → Supabase auth |
| 38 | G3 | Frontend: Google + GitHub sign-in UI (done) |
| 39 | G4 | Frontend: API base URL / proxy to Express |
| 40 | G5 | Frontend: Remove Appwrite |
| 41 | G6 | Frontend: Remove Next.js API routes |
| 42 | G7 | Frontend: Update refs + E2E test |
| 43 | H1 | Backend integration tests (optional) |
| 44 | H2 | Backend README + API doc |
| 45 | H3 | Backend run/deploy notes (Docker, exec) |

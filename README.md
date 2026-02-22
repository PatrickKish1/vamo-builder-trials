# Code Easy (Vamo Builder)

Lovable-style builder where founders iterate on startup UI and business progress in parallel. Progress is rewarded with pineapples (in-app currency); projects can be listed for sale or receive instant Vamo offers.

## Stack

- **Frontend**: Next.js 14+ (App Router), React, TypeScript, shadcn/ui, Tailwind
- **Backend**: Express, Supabase (PostgreSQL + Auth), RLS-only (no service role in app code)
- **Builder runtime**: E2B cloud sandboxes; project files stored in Supabase

## Quick start

1. **Backend**
   - `cd backend && pnpm install`
   - Copy `backend/.env.example` to `backend/.env` and set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORT`. Optionally `OPENAI_API_KEY`, `E2B_API_KEY`, etc.
   - Apply migrations: from `backend`, run `node supabase/push.cjs` (or apply `backend/supabase/migrations/*.sql` in Supabase SQL Editor in order).
   - `pnpm dev` (default port 4000)

2. **Frontend**
   - `cd frontend && pnpm install`
   - Copy `frontend/.env.local.example` to `frontend/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL=http://localhost:4000` (or leave unset to use Next.js proxy to backend).
   - `pnpm dev` (default port 3000)

3. **Admin**
   - In Supabase, set `profiles.is_admin = true` for your user to access `/admin`.

## Project layout

- `frontend/` – Next.js app (builder UI, wallet, marketplace, auth)
- `backend/` – Express API (`/api/v1/*`), Supabase client, E2B sandbox, chat/rewards/builder logic
- `backend/supabase/migrations/` – SQL migrations (profiles, builder_projects, rewards, offers, etc.)
- `project.md` – Full product and submission requirements

## Key flows

- **Auth**: Supabase Auth (email/password); session validated via backend `/api/v1/auth/session`.
- **Builder**: Create project → scaffold (E2B) → chat/code/preview; progress score, traction, valuation, linked assets in Business panel.
- **Pineapples**: Awarded per event (prompt, links, feature_shipped, etc.); redeem for rewards; admin fulfills in `/admin`.
- **Offers**: “Get Vamo Offer” (progress ≥ 10%) generates AI valuation and stores offer; “List for Sale” (progress ≥ 20%) lists on marketplace.

See `frontend/README.md` and `backend/README.md` for more detail.


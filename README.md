# RAAS RANG 2026 — Organiser Portal

QR-based event entry system for RAAS RANG 2026. Phase 1: organiser-side web app for managing attendee passes.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Auth & Database**: Supabase (Auth + PostgreSQL)
- **Styling**: Vanilla CSS (festive design system)
- **Deployment**: Vercel (Phase 2)

## Local Setup

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### 1. Clone & Install

```bash
git clone <repo-url>
cd raasrang
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> ⚠️ **Never commit `.env.local`**. It is in `.gitignore`.
> The `SUPABASE_SERVICE_ROLE_KEY` is used only server-side. It must never appear in `NEXT_PUBLIC_*` variables, browser code, or logs.

### 3. Apply Database Migration

1. Open the **Supabase Dashboard → SQL Editor**
2. Copy the contents of `supabase/migrations/001_initial_schema.sql`
3. Run the SQL

This creates:
- `organisers` table (allowlist, no browser access)
- `passes` table (with RLS policies)
- Required indexes and constraints

> **Note:** If you want the trigram search index, first enable the extension:
> ```sql
> CREATE EXTENSION IF NOT EXISTS pg_trgm;
> ```

### 4. Authorise the First Organiser

1. Start the app and create an account via the sign-in page (Supabase Auth handles user creation).
   - If your Supabase project does not have "Allow new users to sign up" enabled, create the user in the Supabase Dashboard → Authentication → Users.
2. Copy the user's UUID from **Supabase Dashboard → Authentication → Users**.
3. In the **SQL Editor**, run:

```sql
INSERT INTO public.organisers (user_id) VALUES ('paste-user-uuid-here');
```

This **cannot** be done from the browser — that's intentional.

### 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Pages

| Route | Description |
|---|---|
| `/login` | Sign in with email & password |
| `/dashboard` | Attendee list with search, filter, stats |
| `/dashboard/add` | Add a new attendee + generate pass token |
| `/dashboard/passes/[id]` | View full pass details including token |

## Security Model

- **Row Level Security**: The `passes` table has SELECT/INSERT policies that require the authenticated user to be in the `organisers` table.
- **Organiser allowlist**: The `organisers` table has no browser-accessible RLS policies. Only direct SQL or service-role API can add organisers.
- **Token generation**: Uses `crypto.randomBytes(32)` (256-bit). Unique constraint on the `token` column.
- **Token visibility**: Tokens are never exposed in the attendee list. They are shown only in the authorised pass-detail view.
- **Service role key**: Used only in server actions (`src/actions/passes.ts`, `src/lib/supabase/admin.ts`). Never sent to the browser.

## Test Steps

1. **Unauthenticated access**: Visit `/dashboard` → should redirect to `/login`.
2. **Sign in**: Enter valid credentials → should redirect to `/dashboard`.
3. **Non-organiser access**: Sign in with a user NOT in the `organisers` table → should see "Access Denied".
4. **Add attendee**: Click "+ Add Attendee", fill form, submit → should show success and redirect to pass detail.
5. **Unique tokens**: Add two attendees → each should have a different token on their detail pages.
6. **Invalid input**: Submit empty name or invalid email → should show validation errors.
7. **Search & filter**: Use the search bar and dropdowns on the dashboard.
8. **Sign out**: Click "Sign Out" → should redirect to `/login`.
9. **Refresh persistence**: Add an attendee, refresh the page → should still appear.

## Vercel Deployment (Later)

1. Push to GitHub
2. Import into Vercel
3. Set the same three environment variables in Vercel's project settings
4. Deploy

## Future Phases

- QR code generation & delivery (email / WhatsApp)
- Gate scanner app
- Google Sheets sync
- Payment integration
- Bulk import

## Project Structure

```
src/
├── actions/           # Server actions (auth, passes)
├── app/
│   ├── dashboard/     # Protected organiser pages
│   ├── login/         # Sign-in page
│   ├── globals.css    # Design system
│   ├── layout.tsx     # Root layout
│   └── page.tsx       # Redirect to /dashboard
├── components/        # UI components
├── lib/
│   ├── supabase/      # Client helpers (browser, server, admin)
│   ├── auth.ts        # Auth + organiser check helpers
│   └── utils.ts       # Validation & formatting
├── middleware.ts       # Auth middleware
└── types/             # TypeScript types
```

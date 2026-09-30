# RAAS RANG 2026 — Organiser Portal & Physical Gate System

Event entry and physical ticket management system for RAAS RANG 2026. Built with Next.js (App Router), Supabase (PostgreSQL + Auth + SSR), and Vanilla CSS.

---

## Key Features

1. **Gate Verification & Entry (`/dashboard/verify`)**:
   - Single-purpose, mobile-first gate operator interface optimized for iPhone Safari and Android.
   - Dual-mode verification: **📷 Scan QR** (rear camera preferred) & **⌨ Enter Code** (8-character Crockford Base32 format `XXXX-XXXX`).
   - Frame-locked scanner: Automatically pauses video stream immediately upon decode to eliminate multi-frame duplicate scans and race conditions.
   - Binary decision directives:
     - `ALLOW ENTRY` (Green) — Verified unused pass, atomically redeemed.
     - `DENY ENTRY — ALREADY USED` (Red) — Pass previously redeemed, displays original check-in timestamp.
     - `DENY ENTRY — INVALID PASS` (Red) — Ticket not found in event database.
     - `DENY ENTRY — CANCELLED` (Purple) — Revoked by event organisers.
     - `DO NOT ADMIT — TIMEOUT / ERROR` (Amber) — Ambiguous network outcome.
   - Frozen decision display: Requires explicit staff tap on **Scan Next Pass** before resuming camera or allowing next entry.

2. **Physical Ticket Batches (`/dashboard/batches`)**:
   - Atomic batch generation up to 500 passes per run using hardened PostgreSQL function `create_ticket_batch`.
   - Generates cryptographically secure 64-character hex QR token (`passes.token`) and human-typable 8-character Crockford Base32 manual code (`passes.manual_code`).
   - Pre-print physical ticket sheets formatted for A4 card stock (2 columns, avoid page splits, print sequence `#N`).
   - Clear visual badges distinguishing **🧪 TEST BATCH** from **✓ OFFICIAL EVENT INVENTORY**.

3. **Pass Management & Attendee Directory (`/dashboard`)**:
   - Real-time statistics: Total Passes, Unused, Redeemed at Gate, Cancelled, and Ticket Batches.
   - Searchable by name, manual code, phone, or email.
   - Category and status filters synchronized with URL query params (preserves filter position when navigating back from pass detail).
   - Clean client pagination (25 items per page).

---

## Security Model

- **Atomic Database Redemption**: `public.redeem_pass(p_input_type, p_input_value)` executes with row-level pessimistic locking (`FOR UPDATE`) inside a `SECURITY DEFINER` function with `SET search_path = ''`.
- **Zero Public RPC Execution**: `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;`.
- **Organiser Verification**: The RPC verifies `auth.uid()` against `public.organisers` before checking or locking pass rows.
- **Session Forwarding**: Next.js Server Actions forward the authenticated user session cookie via `@supabase/ssr` (`await createClient()`), ensuring `auth.uid()` resolves accurately inside PostgreSQL.
- **Tamper Resistance**: Direct UPDATE privileges on `public.passes` are completely revoked from client roles (`authenticated`, `anon`, `PUBLIC`). Pass status can only transition via the hardened `redeem_pass` function.
- **Credential Protection**: Raw QR tokens are masked in the UI and never exposed in attendee listings or client-side gate logs.

---

## Gate Operator Ambiguous Timeout Procedure

If a network timeout occurs while scanning a pass at the gate:
1. **Never assume the ticket is unused.** The atomic database transaction may have committed before the response packet was interrupted.
2. Direct staff to tap **Scan Next Pass** and re-enter or re-scan the exact same ticket immediately.
3. If the second attempt returns **`ALREADY USED`** with a timestamp matching the current minute, the pass was successfully registered on the first attempt — admit the attendee.
4. If it returns an earlier timestamp or continues to fail, hold the attendee and refer to the head supervisor.

---

## Local Setup

### 1. Prerequisites
- Node.js 18+ (tested on Node.js 24)
- A Supabase project with applied migrations:
  - `001_initial_schema.sql`
  - `002_fix_organisers_rls.sql`
  - `003_physical_tickets.sql`

### 2. Install & Configure
```bash
git clone <repo-url>
cd raasrang
npm install
cp .env.example .env.local
```

Configure `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## Testing & Quality Checks

Run the automated test suite (Unit & Integration tests):
```bash
# Run unit tests only
npm run test:unit

# Run full suite (Unit + Supabase Integration tests)
npm test

# Run linter
npm run lint

# Run production build
npm run build
```

---

## Deployed Architecture

- **Production URL**: `https://raasrang.vercel.app`
- **Deployment Repository**: `rishabhk119/raasrang` (branch: `main`)
- **Upstream Repository**: `duality-2/raasrang` (branch: `main`)
- **Supabase Authentication**:
  - Site URL: `https://raasrang.vercel.app`
  - Redirect URLs: `https://raasrang.vercel.app/**`, `http://localhost:3000/**`

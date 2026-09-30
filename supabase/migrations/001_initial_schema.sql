-- ============================================================
-- RAAS RANG 2026 — Phase 1 Schema Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor).
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Organisers allowlist
--    Only users whose auth.uid() appears here can access passes.
--    Insert rows via the Supabase dashboard or service-role API.
--    A browser user CANNOT add themselves.
CREATE TABLE IF NOT EXISTS public.organisers (
  user_id  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organisers ENABLE ROW LEVEL SECURITY;

-- No RLS SELECT/INSERT policies for organisers → browser clients
-- cannot read or modify this table. Only service-role or direct SQL.
-- This is intentional: the allowlist is admin-only.

-- 2. Passes table
CREATE TABLE IF NOT EXISTS public.passes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token            TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN (
                     'couple', 'stag_male', 'stag_female', 'group', 'vip', 'volunteer', 'complimentary'
                   )),
  email            TEXT,
  phone            TEXT,
  status           TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at          TIMESTAMPTZ,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  delivery_status  TEXT NOT NULL DEFAULT 'not_sent' CHECK (delivery_status IN ('not_sent', 'sent', 'delivered', 'failed')),
  delivered_at     TIMESTAMPTZ
);

ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_passes_created_by ON public.passes(created_by);
CREATE INDEX IF NOT EXISTS idx_passes_status     ON public.passes(status);
CREATE INDEX IF NOT EXISTS idx_passes_category   ON public.passes(category);
CREATE INDEX IF NOT EXISTS idx_passes_token      ON public.passes(token);
CREATE INDEX IF NOT EXISTS idx_passes_name_trgm  ON public.passes USING gin (name gin_trgm_ops);
-- ↑ If the pg_trgm extension is not enabled, run:
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- before applying this migration, or remove this index.

-- 4. RLS Policies — passes
--    Only allow access if the authenticated user is in the organisers table.

CREATE POLICY "Organisers can view passes"
  ON public.passes FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.organisers WHERE user_id = auth.uid())
  );

CREATE POLICY "Organisers can create passes"
  ON public.passes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.organisers WHERE user_id = auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Organisers can update passes"
  ON public.passes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.organisers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.organisers WHERE user_id = auth.uid())
  );

-- 5. Deny all anonymous access
-- (Supabase's default anon role has no policies above, so it's denied.)

-- ============================================================
-- FIRST ORGANISER SETUP
-- After creating a user account via the sign-in page, find their
-- user ID in the Supabase dashboard (Authentication → Users),
-- then run:
--
--   INSERT INTO public.organisers (user_id)
--   VALUES ('paste-user-uuid-here');
--
-- This CANNOT be done from the browser.
-- ============================================================

-- ============================================================
-- RAAS RANG 2026 — Migration 004: Multi-Person, Seasonal Passes,
-- Day-Specific Single Tickets, RBAC Roles (Admin, Scanner, Ticketer),
-- Atomic Group Admissions & Audit
-- File: supabase/migrations/004_scan_details_and_scanner_role.sql
--
-- STATUS: DRAFT — PENDING EXPLICIT USER APPROVAL.
-- DO NOT APPLY TO LIVE DATABASE WITHOUT USER SIGN-OFF.
--
-- GATE CONCEPT: REMOVED. There are no separate gates (A/B/C/D).
-- All scanner devices are equivalent entry points.
-- ============================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Role Resolution Function (Tamper-Proof)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN 'anon';
  END IF;

  -- 1. Check organiser allowlist (always Admin)
  IF EXISTS (SELECT 1 FROM public.organisers WHERE user_id = v_uid) THEN
    RETURN 'admin';
  END IF;

  -- 2. Check app_metadata.role from JWT claims (Admin, Scanner, or Ticketer)
  BEGIN
    v_role := (current_setting('request.jwt.claims', true)::json->'app_metadata')->>'role';
    IF v_role IN ('admin', 'scanner', 'ticketer') THEN
      RETURN v_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'authenticated';
  END;

  RETURN 'authenticated';
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;

-- 3. Event Nights Calendar Table (Configured by Admin — No Guessed Dates)
CREATE TABLE IF NOT EXISTS public.event_nights (
  id           TEXT PRIMARY KEY, -- e.g. 'night_1', 'night_2', ...
  night_number INTEGER NOT NULL UNIQUE CHECK (night_number >= 1),
  title        TEXT NOT NULL,
  event_date   DATE NOT NULL UNIQUE,
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT chk_night_times CHECK (start_time < end_time)
);

ALTER TABLE public.event_nights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view event nights" ON public.event_nights;
CREATE POLICY "Anyone authenticated can view event nights"
  ON public.event_nights FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert event nights" ON public.event_nights;
CREATE POLICY "Admins can insert event nights"
  ON public.event_nights FOR INSERT
  TO authenticated
  WITH CHECK (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Admins can update event nights" ON public.event_nights;
CREATE POLICY "Admins can update event nights"
  ON public.event_nights FOR UPDATE
  TO authenticated
  USING (public.get_current_user_role() = 'admin')
  WITH CHECK (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Admins can delete event nights" ON public.event_nights;
CREATE POLICY "Admins can delete event nights"
  ON public.event_nights FOR DELETE
  TO authenticated
  USING (public.get_current_user_role() = 'admin');

-- Seed confirmed event night: Day 1, 4 October 2026
-- Additional nights must be added by the admin via the admin screen.
INSERT INTO public.event_nights (id, night_number, title, event_date, start_time, end_time, is_active)
VALUES (
  'night_1',
  1,
  'Day 1',
  '2026-10-04',
  '2026-10-04T18:00:00+05:30',
  '2026-10-05T06:00:00+05:30',
  true
)
ON CONFLICT (id) DO NOTHING;

-- 4. Update public.passes table schema
ALTER TABLE public.passes
  ADD COLUMN IF NOT EXISTS ticket_type              TEXT NOT NULL DEFAULT 'single' CHECK (ticket_type IN ('single', 'seasonal')),
  ADD COLUMN IF NOT EXISTS party_size                INTEGER NOT NULL DEFAULT 1 CHECK (party_size >= 1 AND party_size <= 10),
  ADD COLUMN IF NOT EXISTS valid_night_id            TEXT REFERENCES public.event_nights(id),
  ADD COLUMN IF NOT EXISTS seasonal_start_night_id   TEXT REFERENCES public.event_nights(id),
  ADD COLUMN IF NOT EXISTS seasonal_nights_count     INTEGER CHECK (seasonal_nights_count >= 1),
  ADD COLUMN IF NOT EXISTS validity_state            TEXT NOT NULL DEFAULT 'active' CHECK (validity_state IN ('active', 'paused', 'cancelled', 'completed')),
  ADD COLUMN IF NOT EXISTS idempotency_key           TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS issued_by                 UUID REFERENCES auth.users(id);

-- Enforce: single tickets MUST have valid_night_id, seasonal MUST NOT
-- (Deferred to allow backfill of existing passes which are all single with NULL valid_night_id)
-- The CHECK is enforced at the RPC level for new passes. A future migration can add:
-- ALTER TABLE public.passes ADD CONSTRAINT chk_valid_night_type
--   CHECK ((ticket_type = 'single' AND valid_night_id IS NOT NULL) OR (ticket_type = 'seasonal' AND valid_night_id IS NULL));

-- Safe backfill for existing passes (preserves all 001-003 passes)
UPDATE public.passes
SET issued_by = created_by
WHERE issued_by IS NULL;

-- Index for day-specific lookups
CREATE INDEX IF NOT EXISTS idx_passes_valid_night ON public.passes(valid_night_id) WHERE valid_night_id IS NOT NULL;

-- 5. Seasonal Pass Eligible Nights Junction Table
CREATE TABLE IF NOT EXISTS public.pass_eligible_nights (
  pass_id        UUID NOT NULL REFERENCES public.passes(id) ON DELETE CASCADE,
  event_night_id TEXT NOT NULL REFERENCES public.event_nights(id) ON DELETE RESTRICT,
  PRIMARY KEY (pass_id, event_night_id)
);

ALTER TABLE public.pass_eligible_nights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view eligible nights" ON public.pass_eligible_nights;
CREATE POLICY "Anyone authenticated can view eligible nights"
  ON public.pass_eligible_nights FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and ticketers can manage eligible nights" ON public.pass_eligible_nights;
CREATE POLICY "Admins and ticketers can manage eligible nights"
  ON public.pass_eligible_nights FOR ALL
  TO authenticated
  USING (public.get_current_user_role() IN ('admin', 'ticketer'))
  WITH CHECK (public.get_current_user_role() IN ('admin', 'ticketer'));

-- 6. Append-Only Admissions Table (Successful Admissions)
-- NOTE: No scan_gate column. All scanner devices are equivalent entry points.
CREATE TABLE IF NOT EXISTS public.admissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_request_id TEXT NOT NULL UNIQUE,
  pass_id           UUID NOT NULL REFERENCES public.passes(id) ON DELETE RESTRICT,
  event_night_id    TEXT REFERENCES public.event_nights(id) ON DELETE RESTRICT,
  people_count      INTEGER NOT NULL CHECK (people_count >= 1 AND people_count <= 10),
  scan_method       TEXT NOT NULL CHECK (scan_method IN ('qr', 'manual')),
  scanned_by        UUID NOT NULL REFERENCES auth.users(id),
  admitted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_admissions_pass_night ON public.admissions(pass_id, event_night_id);
CREATE INDEX IF NOT EXISTS idx_admissions_admitted_at ON public.admissions(admitted_at DESC);

-- 7. Rejected Admission Attempts Table (Audit without storing credential tokens)
-- NOTE: No scan_gate column.
CREATE TABLE IF NOT EXISTS public.admission_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_request_id TEXT,
  pass_id           UUID REFERENCES public.passes(id) ON DELETE SET NULL,
  event_night_id    TEXT REFERENCES public.event_nights(id) ON DELETE SET NULL,
  rejection_reason  TEXT NOT NULL,
  requested_count   INTEGER,
  remaining_count   INTEGER,
  scan_method       TEXT NOT NULL CHECK (scan_method IN ('qr', 'manual')),
  scanned_by        UUID REFERENCES auth.users(id),
  attempted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admission_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_admission_attempts_pass ON public.admission_attempts(pass_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_admission_attempts_time ON public.admission_attempts(attempted_at DESC);

-- 8. Audited Supervisor Corrections Table
CREATE TABLE IF NOT EXISTS public.admission_corrections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id    UUID NOT NULL REFERENCES public.admissions(id) ON DELETE RESTRICT,
  pass_id         UUID NOT NULL REFERENCES public.passes(id) ON DELETE RESTRICT,
  event_night_id  TEXT REFERENCES public.event_nights(id),
  correction_type TEXT NOT NULL CHECK (correction_type IN ('reverse', 'adjust_count')),
  people_delta    INTEGER NOT NULL,
  reason          TEXT NOT NULL CHECK (length(trim(reason)) >= 5),
  corrected_by    UUID NOT NULL REFERENCES auth.users(id),
  corrected_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admission_corrections ENABLE ROW LEVEL SECURITY;

-- 9. Ticket Deliveries Table (Separated from Entry Credentials)
CREATE TABLE IF NOT EXISTS public.ticket_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id             UUID NOT NULL REFERENCES public.passes(id) ON DELETE CASCADE,
  idempotency_key     TEXT NOT NULL UNIQUE,
  channel             TEXT NOT NULL CHECK (channel IN ('whatsapp_manual', 'whatsapp_api')),
  destination_phone   TEXT,
  provider            TEXT,
  provider_message_id TEXT,
  delivery_status     TEXT NOT NULL DEFAULT 'ready_to_share' CHECK (delivery_status IN (
                        'ready_to_share', 'manually_shared', 'queued', 'sent', 'delivered', 'failed', 'read'
                      )),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at        TIMESTAMPTZ,
  created_by          UUID REFERENCES auth.users(id)
);

ALTER TABLE public.ticket_deliveries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ticket_deliveries_pass ON public.ticket_deliveries(pass_id);
CREATE INDEX IF NOT EXISTS idx_ticket_deliveries_status ON public.ticket_deliveries(delivery_status);


-- 10. RLS Hardening: Strict Separation of Concerns
-- Remove direct table access to ticket credentials for Scanners
DROP POLICY IF EXISTS "Organisers can view passes" ON public.passes;
DROP POLICY IF EXISTS "Scanners can view passes" ON public.passes;
DROP POLICY IF EXISTS "Organisers can create passes" ON public.passes;

-- Admins: Full SELECT
DROP POLICY IF EXISTS "Admins can view passes" ON public.passes;
CREATE POLICY "Admins can view passes"
  ON public.passes FOR SELECT
  TO authenticated
  USING (public.get_current_user_role() = 'admin');

-- Ticketers: Can ONLY view passes they created
DROP POLICY IF EXISTS "Ticketers can view their own passes" ON public.passes;
CREATE POLICY "Ticketers can view their own passes"
  ON public.passes FOR SELECT
  TO authenticated
  USING (
    public.get_current_user_role() = 'ticketer'
    AND created_by = auth.uid()
  );

-- Admins and Ticketers: Insert passes
DROP POLICY IF EXISTS "Admins and ticketers can create passes" ON public.passes;
CREATE POLICY "Admins and ticketers can create passes"
  ON public.passes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_current_user_role() IN ('admin', 'ticketer')
    AND created_by = auth.uid()
  );

-- Admissions Policies (no gate filtering — all scanners see recent admissions)
DROP POLICY IF EXISTS "Admins can view all admissions" ON public.admissions;
CREATE POLICY "Admins can view all admissions"
  ON public.admissions FOR SELECT
  TO authenticated
  USING (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Scanners can view recent admissions" ON public.admissions;
CREATE POLICY "Scanners can view recent admissions"
  ON public.admissions FOR SELECT
  TO authenticated
  USING (
    public.get_current_user_role() = 'scanner'
    AND admitted_at >= (now() - interval '24 hours')
  );

-- Corrections Policies
DROP POLICY IF EXISTS "Admins can manage corrections" ON public.admission_corrections;
CREATE POLICY "Admins can manage corrections"
  ON public.admission_corrections FOR ALL
  TO authenticated
  USING (public.get_current_user_role() = 'admin');

-- Deliveries Policies
DROP POLICY IF EXISTS "Admins can view all deliveries" ON public.ticket_deliveries;
CREATE POLICY "Admins can view all deliveries"
  ON public.ticket_deliveries FOR ALL
  TO authenticated
  USING (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Ticketers can manage their own deliveries" ON public.ticket_deliveries;
CREATE POLICY "Ticketers can manage their own deliveries"
  ON public.ticket_deliveries FOR ALL
  TO authenticated
  USING (
    public.get_current_user_role() = 'ticketer'
    AND created_by = auth.uid()
  );

-- 11. Helper: Identify Currently Active Event Night (Asia/Kolkata)
-- Matches the server clock date to event_nights.event_date.
-- Uses the event window (start_time to end_time) for precision.
CREATE OR REPLACE FUNCTION public.get_current_open_night()
RETURNS RECORD
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_night RECORD;
BEGIN
  SELECT * INTO v_night
  FROM public.event_nights
  WHERE is_active = true
    AND pg_catalog.now() >= start_time
    AND pg_catalog.now() <= end_time
  ORDER BY start_time ASC
  LIMIT 1;

  RETURN v_night;
END;
$$;

-- 12. RPC 1: Read-Only Ticket Preview (Never Admits)
CREATE OR REPLACE FUNCTION public.preview_ticket_allowance(
  p_input_type TEXT,
  p_input_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_pass RECORD;
  v_cleaned_code TEXT;
  v_canonical_code TEXT;
  v_open_night RECORD;
  v_is_eligible BOOLEAN := false;
  v_night_admitted INTEGER := 0;
  v_total_admitted INTEGER := 0;
  v_remaining INTEGER := 0;
  v_valid_night RECORD;
BEGIN
  -- Verify caller role
  v_role := public.get_current_user_role();
  IF v_role NOT IN ('admin', 'scanner') THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'UNAUTHORIZED',
      'message', 'Caller is not authorised to preview tickets.'
    );
  END IF;

  -- Validate input
  IF p_input_type = 'qr' THEN
    SELECT * INTO v_pass
    FROM public.passes
    WHERE token = pg_catalog.btrim(p_input_value);
  ELSIF p_input_type = 'manual' THEN
    v_cleaned_code := pg_catalog.upper(pg_catalog.regexp_replace(p_input_value, '[^A-Za-z0-9]', '', 'g'));
    IF pg_catalog.length(v_cleaned_code) <> 8 THEN
      RETURN pg_catalog.jsonb_build_object('status', 'INVALID');
    END IF;
    v_canonical_code := pg_catalog.substr(v_cleaned_code, 1, 4) || '-' || pg_catalog.substr(v_cleaned_code, 5, 4);

    SELECT * INTO v_pass
    FROM public.passes
    WHERE manual_code = v_canonical_code;
  ELSE
    RETURN pg_catalog.jsonb_build_object('status', 'INVALID');
  END IF;

  IF v_pass IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'INVALID');
  END IF;

  IF v_pass.status = 'cancelled' OR v_pass.validity_state = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'CANCELLED',
      'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
      'category', v_pass.category
    );
  END IF;

  -- Identify open event night from server clock
  SELECT * INTO v_open_night
  FROM public.event_nights
  WHERE is_active = true
    AND pg_catalog.now() >= start_time
    AND pg_catalog.now() <= end_time
  ORDER BY start_time ASC
  LIMIT 1;

  -- Handle Seasonal Passes: strictly require active open night and check pass_eligible_nights
  IF v_pass.ticket_type = 'seasonal' THEN
    IF v_open_night.id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'OUTSIDE_EVENT_WINDOW',
        'message', 'No event night is currently active. Cannot admit.',
        'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
        'ticket_type', 'seasonal',
        'party_size', v_pass.party_size
      );
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.pass_eligible_nights
      WHERE pass_id = v_pass.id AND event_night_id = v_open_night.id
    ) INTO v_is_eligible;

    IF NOT v_is_eligible THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'NIGHT_NOT_INCLUDED',
        'message', 'Ticket is not eligible for tonight''s event night.',
        'event_night', v_open_night.title,
        'name', COALESCE(v_pass.name, 'Unassigned Ticket')
      );
    END IF;

    -- Admissions tonight
    SELECT COALESCE(SUM(people_count), 0) INTO v_night_admitted
    FROM public.admissions
    WHERE pass_id = v_pass.id AND event_night_id = v_open_night.id;

    v_remaining := GREATEST(0, v_pass.party_size - v_night_admitted);

    IF v_remaining = 0 THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'NIGHT_FULL',
        'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
        'ticket_type', 'seasonal',
        'party_size', v_pass.party_size,
        'admitted_count', v_night_admitted,
        'remaining_count', 0,
        'event_night', v_open_night.title
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'VALID',
      'pass_id', v_pass.id,
      'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
      'category', v_pass.category,
      'ticket_type', 'seasonal',
      'party_size', v_pass.party_size,
      'admitted_count', v_night_admitted,
      'remaining_count', v_remaining,
      'event_night_id', v_open_night.id,
      'event_night_title', v_open_night.title
    );
  END IF;

  -- Handle Single Tickets: day-specific enforcement
  -- 1. No active night today → DENY
  IF v_open_night.id IS NULL THEN
    -- Look up what night this ticket is for (for the error message)
    IF v_pass.valid_night_id IS NOT NULL THEN
      SELECT * INTO v_valid_night FROM public.event_nights WHERE id = v_pass.valid_night_id;
      RETURN pg_catalog.jsonb_build_object(
        'status', 'OUTSIDE_EVENT_WINDOW',
        'message', 'NO EVENT TODAY',
        'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
        'ticket_type', 'single',
        'party_size', v_pass.party_size,
        'intended_night', COALESCE(v_valid_night.title, 'Unknown')
      );
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'OUTSIDE_EVENT_WINDOW',
      'message', 'NO EVENT TODAY',
      'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
      'ticket_type', 'single',
      'party_size', v_pass.party_size
    );
  END IF;

  -- 2. Single ticket day mismatch → DENY with intended day
  IF v_pass.valid_night_id IS NOT NULL AND v_pass.valid_night_id <> v_open_night.id THEN
    SELECT * INTO v_valid_night FROM public.event_nights WHERE id = v_pass.valid_night_id;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'WRONG_DAY',
      'message', 'WRONG DAY - ticket is for ' || COALESCE(v_valid_night.title, 'another day'),
      'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
      'ticket_type', 'single',
      'party_size', v_pass.party_size,
      'intended_night', COALESCE(v_valid_night.title, 'Unknown'),
      'intended_date', v_valid_night.event_date,
      'current_night', v_open_night.title
    );
  END IF;

  -- 3. Check total admissions for single ticket
  SELECT COALESCE(SUM(people_count), 0) INTO v_total_admitted
  FROM public.admissions
  WHERE pass_id = v_pass.id;

  v_remaining := GREATEST(0, v_pass.party_size - v_total_admitted);

  IF v_remaining = 0 OR v_pass.status = 'used' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'TICKET_COMPLETE',
      'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
      'ticket_type', 'single',
      'party_size', v_pass.party_size,
      'admitted_count', v_total_admitted,
      'remaining_count', 0,
      'event_night', v_open_night.title
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'VALID',
    'pass_id', v_pass.id,
    'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
    'category', v_pass.category,
    'ticket_type', 'single',
    'party_size', v_pass.party_size,
    'admitted_count', v_total_admitted,
    'remaining_count', v_remaining,
    'event_night_id', v_open_night.id,
    'event_night_title', v_open_night.title
  );
END;
$$;

-- 13. RPC 2: Authoritative Atomic Pass Admission (Admit N)
-- NOTE: No gate parameter. All scanner devices are equivalent entry points.
CREATE OR REPLACE FUNCTION public.admit_pass(
  p_input_type TEXT,
  p_input_value TEXT,
  p_people_count INTEGER,
  p_client_request_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_pass RECORD;
  v_cleaned_code TEXT;
  v_canonical_code TEXT;
  v_open_night RECORD;
  v_valid_night RECORD;
  v_is_eligible BOOLEAN;
  v_admitted_so_far INTEGER := 0;
  v_remaining INTEGER := 0;
  v_new_admission_id UUID;
  v_existing_admission RECORD;
BEGIN
  -- 1. Verify caller role
  v_caller_id := auth.uid();
  v_role := public.get_current_user_role();
  IF v_caller_id IS NULL OR v_role NOT IN ('admin', 'scanner') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'UNAUTHORIZED', 'message', 'Caller is not authorised.');
  END IF;

  -- 2. Validate client_request_id (idempotency key)
  IF p_client_request_id IS NULL OR pg_catalog.length(pg_catalog.btrim(p_client_request_id)) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'ERROR', 'message', 'Client request ID is required for idempotency.');
  END IF;

  -- Check idempotent replay
  SELECT * INTO v_existing_admission
  FROM public.admissions
  WHERE client_request_id = pg_catalog.btrim(p_client_request_id);

  IF v_existing_admission.id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'ADMIT_N',
      'idempotent_replay', true,
      'admitted_now', v_existing_admission.people_count,
      'admitted_at', v_existing_admission.admitted_at
    );
  END IF;

  -- 3. Validate people count (1 to 10)
  IF p_people_count IS NULL OR p_people_count < 1 OR p_people_count > 10 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'ERROR', 'message', 'Invalid people count.');
  END IF;

  -- 4. Exclusive row lock on public.passes (SERIALIZES CONCURRENT SCANNER SCANS)
  IF p_input_type = 'qr' THEN
    SELECT * INTO v_pass
    FROM public.passes
    WHERE token = pg_catalog.btrim(p_input_value)
    FOR UPDATE;
  ELSIF p_input_type = 'manual' THEN
    v_cleaned_code := pg_catalog.upper(pg_catalog.regexp_replace(p_input_value, '[^A-Za-z0-9]', '', 'g'));
    IF pg_catalog.length(v_cleaned_code) <> 8 THEN
      RETURN pg_catalog.jsonb_build_object('status', 'INVALID');
    END IF;
    v_canonical_code := pg_catalog.substr(v_cleaned_code, 1, 4) || '-' || pg_catalog.substr(v_cleaned_code, 5, 4);

    SELECT * INTO v_pass
    FROM public.passes
    WHERE manual_code = v_canonical_code
    FOR UPDATE;
  ELSE
    RETURN pg_catalog.jsonb_build_object('status', 'ERROR', 'message', 'Invalid input type.');
  END IF;

  IF v_pass IS NULL THEN
    INSERT INTO public.admission_attempts (client_request_id, scan_method, rejection_reason, requested_count, scanned_by)
    VALUES (p_client_request_id, p_input_type, 'INVALID', p_people_count, v_caller_id);
    RETURN pg_catalog.jsonb_build_object('status', 'INVALID');
  END IF;

  -- 5. Check cancellation / activation
  IF v_pass.status = 'cancelled' OR v_pass.validity_state = 'cancelled' THEN
    INSERT INTO public.admission_attempts (client_request_id, pass_id, scan_method, rejection_reason, requested_count, scanned_by)
    VALUES (p_client_request_id, v_pass.id, p_input_type, 'CANCELLED', p_people_count, v_caller_id);
    RETURN pg_catalog.jsonb_build_object('status', 'CANCELLED', 'name', COALESCE(v_pass.name, 'Unassigned Ticket'));
  END IF;

  -- 6. Identify open event night from server clock (never trust client)
  SELECT * INTO v_open_night
  FROM public.event_nights
  WHERE is_active = true
    AND pg_catalog.now() >= start_time
    AND pg_catalog.now() <= end_time
  ORDER BY start_time ASC
  LIMIT 1;

  -- 7. Seasonal Pass Check
  IF v_pass.ticket_type = 'seasonal' THEN
    IF v_open_night.id IS NULL THEN
      INSERT INTO public.admission_attempts (client_request_id, pass_id, scan_method, rejection_reason, requested_count, scanned_by)
      VALUES (p_client_request_id, v_pass.id, p_input_type, 'OUTSIDE_EVENT_WINDOW', p_people_count, v_caller_id);
      RETURN pg_catalog.jsonb_build_object(
        'status', 'OUTSIDE_EVENT_WINDOW',
        'message', 'NO EVENT TODAY'
      );
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.pass_eligible_nights
      WHERE pass_id = v_pass.id AND event_night_id = v_open_night.id
    ) INTO v_is_eligible;

    IF NOT v_is_eligible THEN
      INSERT INTO public.admission_attempts (client_request_id, pass_id, event_night_id, scan_method, rejection_reason, requested_count, scanned_by)
      VALUES (p_client_request_id, v_pass.id, v_open_night.id, p_input_type, 'NIGHT_NOT_INCLUDED', p_people_count, v_caller_id);
      RETURN pg_catalog.jsonb_build_object('status', 'NIGHT_NOT_INCLUDED', 'message', 'Pass not eligible for tonight.');
    END IF;

    SELECT COALESCE(SUM(people_count), 0) INTO v_admitted_so_far
    FROM public.admissions
    WHERE pass_id = v_pass.id AND event_night_id = v_open_night.id;

    v_remaining := GREATEST(0, v_pass.party_size - v_admitted_so_far);

    IF v_remaining = 0 THEN
      INSERT INTO public.admission_attempts (client_request_id, pass_id, event_night_id, scan_method, rejection_reason, requested_count, remaining_count, scanned_by)
      VALUES (p_client_request_id, v_pass.id, v_open_night.id, p_input_type, 'NIGHT_FULL', p_people_count, 0, v_caller_id);
      RETURN pg_catalog.jsonb_build_object(
        'status', 'NIGHT_FULL',
        'remaining_count', 0,
        'name', COALESCE(v_pass.name, 'Unassigned Ticket')
      );
    END IF;
  ELSE
    -- 8. Single ticket: day-specific enforcement
    -- 8a. No active night → DENY
    IF v_open_night.id IS NULL THEN
      INSERT INTO public.admission_attempts (client_request_id, pass_id, scan_method, rejection_reason, requested_count, scanned_by)
      VALUES (p_client_request_id, v_pass.id, p_input_type, 'OUTSIDE_EVENT_WINDOW', p_people_count, v_caller_id);
      RETURN pg_catalog.jsonb_build_object(
        'status', 'OUTSIDE_EVENT_WINDOW',
        'message', 'NO EVENT TODAY',
        'name', COALESCE(v_pass.name, 'Unassigned Ticket')
      );
    END IF;

    -- 8b. Wrong day → DENY with intended day info (does NOT consume allowance)
    IF v_pass.valid_night_id IS NOT NULL AND v_pass.valid_night_id <> v_open_night.id THEN
      SELECT * INTO v_valid_night FROM public.event_nights WHERE id = v_pass.valid_night_id;
      INSERT INTO public.admission_attempts (client_request_id, pass_id, event_night_id, scan_method, rejection_reason, requested_count, scanned_by)
      VALUES (p_client_request_id, v_pass.id, v_open_night.id, p_input_type, 'WRONG_DAY', p_people_count, v_caller_id);
      RETURN pg_catalog.jsonb_build_object(
        'status', 'WRONG_DAY',
        'message', 'WRONG DAY - ticket is for ' || COALESCE(v_valid_night.title, 'another day'),
        'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
        'intended_night', COALESCE(v_valid_night.title, 'Unknown'),
        'intended_date', v_valid_night.event_date,
        'current_night', v_open_night.title
      );
    END IF;

    -- 8c. Correct day or legacy pass (no valid_night_id): check total admissions
    SELECT COALESCE(SUM(people_count), 0) INTO v_admitted_so_far
    FROM public.admissions
    WHERE pass_id = v_pass.id;

    v_remaining := GREATEST(0, v_pass.party_size - v_admitted_so_far);

    IF v_remaining = 0 OR v_pass.status = 'used' THEN
      INSERT INTO public.admission_attempts (client_request_id, pass_id, scan_method, rejection_reason, requested_count, remaining_count, scanned_by)
      VALUES (p_client_request_id, v_pass.id, p_input_type, 'TICKET_COMPLETE', p_people_count, 0, v_caller_id);
      RETURN pg_catalog.jsonb_build_object(
        'status', 'TICKET_COMPLETE',
        'remaining_count', 0,
        'name', COALESCE(v_pass.name, 'Unassigned Ticket')
      );
    END IF;
  END IF;

  -- 9. Strict Group Limit Check: NEVER admit part of an over-limit request
  IF p_people_count > v_remaining THEN
    INSERT INTO public.admission_attempts (client_request_id, pass_id, event_night_id, scan_method, rejection_reason, requested_count, remaining_count, scanned_by)
    VALUES (p_client_request_id, v_pass.id, v_open_night.id, p_input_type, 'TOO_MANY', p_people_count, v_remaining, v_caller_id);
    RETURN pg_catalog.jsonb_build_object(
      'status', 'TOO_MANY',
      'remaining_count', v_remaining,
      'requested_count', p_people_count,
      'message', 'Requested count exceeds remaining allowance.'
    );
  END IF;

  -- 10. Record Successful Admission (no gate column)
  INSERT INTO public.admissions (
    client_request_id,
    pass_id,
    event_night_id,
    people_count,
    scan_method,
    scanned_by
  ) VALUES (
    pg_catalog.btrim(p_client_request_id),
    v_pass.id,
    v_open_night.id,
    p_people_count,
    p_input_type,
    v_caller_id
  ) RETURNING id INTO v_new_admission_id;

  -- Update pass status
  UPDATE public.passes
  SET status = CASE
        WHEN v_pass.ticket_type = 'single' AND (v_remaining - p_people_count) <= 0 THEN 'used'
        ELSE status
      END,
      used_at = COALESCE(used_at, pg_catalog.now()),
      validity_state = CASE
        WHEN v_pass.ticket_type = 'single' AND (v_remaining - p_people_count) <= 0 THEN 'completed'
        ELSE 'active'
      END
  WHERE id = v_pass.id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'ADMIT_N',
    'admission_id', v_new_admission_id,
    'idempotent_replay', false,
    'admitted_now', p_people_count,
    'remaining_tonight', v_remaining - p_people_count,
    'event_night', COALESCE(v_open_night.title, 'General Admission'),
    'ticket_type', v_pass.ticket_type,
    'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
    'category', v_pass.category
  );
END;
$$;

-- 14. Backward-Compatible Legacy Bridge RPC (Zero Downtime during Rollout)
-- Ensures old scanner sessions calling redeem_pass(TEXT, TEXT) continue working smoothly
-- NOTE: No gate parameter. Passes through to admit_pass without gate.
CREATE OR REPLACE FUNCTION public.redeem_pass(
  p_input_type TEXT,
  p_input_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.admit_pass(
    p_input_type,
    p_input_value,
    1,
    'legacy_' || extensions.gen_random_uuid()::text
  );

  IF (v_res->>'status') = 'ADMIT_N' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'VALID',
      'message', 'Pass verified and redeemed successfully.',
      'used_at', pg_catalog.now(),
      'pass', pg_catalog.jsonb_build_object(
        'id', v_res->>'admission_id',
        'name', v_res->>'name',
        'category', v_res->>'category'
      )
    );
  ELSIF (v_res->>'status') IN ('TICKET_COMPLETE', 'NIGHT_FULL') THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'ALREADY_USED',
      'message', 'Pass has already been used.',
      'pass', pg_catalog.jsonb_build_object(
        'name', v_res->>'name'
      )
    );
  ELSE
    RETURN v_res;
  END IF;
END;
$$;

-- 15. Permissions on RPC Functions
REVOKE ALL ON FUNCTION public.preview_ticket_allowance(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_ticket_allowance(TEXT, TEXT) TO authenticated;

-- admit_pass now takes 4 params (no gate)
REVOKE ALL ON FUNCTION public.admit_pass(TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_pass(TEXT, TEXT, INTEGER, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_pass(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_pass(TEXT, TEXT) TO authenticated;

-- ============================================================
-- ROLLBACK NOTES:
-- To reverse this migration:
--   DROP FUNCTION IF EXISTS public.admit_pass(TEXT, TEXT, INTEGER, TEXT);
--   DROP FUNCTION IF EXISTS public.preview_ticket_allowance(TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.redeem_pass(TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.get_current_open_night();
--   DROP FUNCTION IF EXISTS public.get_current_user_role();
--   DROP TABLE IF EXISTS public.ticket_deliveries;
--   DROP TABLE IF EXISTS public.admission_corrections;
--   DROP TABLE IF EXISTS public.admission_attempts;
--   DROP TABLE IF EXISTS public.admissions;
--   DROP TABLE IF EXISTS public.pass_eligible_nights;
--   DROP TABLE IF EXISTS public.event_nights;
--   ALTER TABLE public.passes DROP COLUMN IF EXISTS ticket_type;
--   ALTER TABLE public.passes DROP COLUMN IF EXISTS party_size;
--   ALTER TABLE public.passes DROP COLUMN IF EXISTS valid_night_id;
--   ALTER TABLE public.passes DROP COLUMN IF EXISTS seasonal_start_night_id;
--   ALTER TABLE public.passes DROP COLUMN IF EXISTS seasonal_nights_count;
--   ALTER TABLE public.passes DROP COLUMN IF EXISTS validity_state;
--   ALTER TABLE public.passes DROP COLUMN IF EXISTS idempotency_key;
--   ALTER TABLE public.passes DROP COLUMN IF EXISTS issued_by;
-- ============================================================

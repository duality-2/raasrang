-- ============================================================
-- RAAS RANG 2026 — Migration 003: Physical Tickets, Batches & Atomic Redemption
-- File: supabase/migrations/003_physical_tickets.sql
-- ============================================================

-- 1. Ensure pgcrypto extension is active in extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Allow unassigned tickets for physical pre-printing
-- Existing named attendees remain preserved.
ALTER TABLE public.passes ALTER COLUMN name DROP NOT NULL;

-- 3. Ticket Batches table for physical ticket printing
CREATE TABLE IF NOT EXISTS public.ticket_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  batch_number    SERIAL UNIQUE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN (
                    'couple', 'stag_male', 'stag_female', 'group', 'vip', 'volunteer', 'complimentary'
                  )),
  total_count     INTEGER NOT NULL CHECK (total_count > 0 AND total_count <= 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID NOT NULL REFERENCES auth.users(id)
);

ALTER TABLE public.ticket_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organisers can view ticket batches"
  ON public.ticket_batches FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.organisers WHERE user_id = auth.uid())
  );

CREATE POLICY "Organisers can insert ticket batches"
  ON public.ticket_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.organisers WHERE user_id = auth.uid())
    AND created_by = auth.uid()
  );

-- 4. Add batch_id and manual_code to public.passes
ALTER TABLE public.passes
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.ticket_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_code TEXT;

-- 5. Hardened Helper Function to generate canonical manual code (XXXX-XXXX)
-- Crockford Base32 alphabet: 8 digits (2-9) + 24 uppercase letters (excludes 0, O, 1, I).
-- Verifies exact 32-character alphabet length.
CREATE OR REPLACE FUNCTION public.generate_manual_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_alphabet_len INTEGER;
  v_result TEXT := '';
  v_i INTEGER;
  v_rand_bytes BYTEA;
BEGIN
  v_alphabet_len := pg_catalog.length(v_chars);
  IF v_alphabet_len <> 32 THEN
    RAISE EXCEPTION 'Manual code alphabet misconfigured: expected 32 characters, got %', v_alphabet_len;
  END IF;

  v_rand_bytes := extensions.gen_random_bytes(8);
  FOR v_i IN 0..7 LOOP
    v_result := v_result || pg_catalog.substr(
      v_chars,
      (pg_catalog.get_byte(v_rand_bytes, v_i) % v_alphabet_len) + 1,
      1
    );
  END LOOP;
  RETURN pg_catalog.substr(v_result, 1, 4) || '-' || pg_catalog.substr(v_result, 5, 4);
END;
$$;

-- Restrict helper function from public execution
REVOKE ALL ON FUNCTION public.generate_manual_code() FROM PUBLIC, anon, authenticated;

-- 6. Backfill existing passes with unique canonical manual codes
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
  collision BOOLEAN;
  attempts INTEGER;
BEGIN
  FOR r IN SELECT id FROM public.passes WHERE manual_code IS NULL LOOP
    attempts := 0;
    LOOP
      attempts := attempts + 1;
      IF attempts > 20 THEN
        RAISE EXCEPTION 'Collision retry limit exceeded during existing pass backfill';
      END IF;

      new_code := public.generate_manual_code();
      SELECT EXISTS(SELECT 1 FROM public.passes WHERE manual_code = new_code) INTO collision;
      IF NOT collision THEN
        EXIT;
      END IF;
    END LOOP;
    UPDATE public.passes SET manual_code = new_code WHERE id = r.id;
  END LOOP;
END $$;

-- 7. Enforce NOT NULL and UNIQUE constraint on manual_code
ALTER TABLE public.passes ALTER COLUMN manual_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_passes_manual_code'
  ) THEN
    ALTER TABLE public.passes ADD CONSTRAINT uq_passes_manual_code UNIQUE (manual_code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_passes_batch_id ON public.passes(batch_id);

-- 8. Table Grant & RLS Hardening
-- Remove broad UPDATE policies entirely.
-- Browser clients cannot directly UPDATE public.passes (prevents credential/status tampering).
DROP POLICY IF EXISTS "Organisers can update passes" ON public.passes;
DROP POLICY IF EXISTS "Organisers can update pass metadata" ON public.passes;
REVOKE UPDATE ON public.passes FROM authenticated, anon, PUBLIC;

-- 9. Hardened Atomic Batch Creation Function
CREATE OR REPLACE FUNCTION public.create_ticket_batch(
  p_idempotency_key TEXT,
  p_name TEXT,
  p_category TEXT,
  p_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_batch_id UUID;
  v_batch_number INTEGER;
  v_existing_count INTEGER;
  v_token TEXT;
  v_manual_code TEXT;
  v_collision BOOLEAN;
  v_attempts INTEGER;
  i INTEGER;
BEGIN
  -- Verify caller is an authenticated organiser
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organisers WHERE user_id = v_caller_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'Caller is not an authorised organiser.'
    );
  END IF;

  -- Validate idempotency key
  IF p_idempotency_key IS NULL OR pg_catalog.length(pg_catalog.trim(p_idempotency_key)) = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'Idempotency key is required.'
    );
  END IF;

  -- Validate name
  IF p_name IS NULL OR pg_catalog.length(pg_catalog.trim(p_name)) = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'Batch name is required.'
    );
  END IF;

  -- Validate count (1 to 500)
  IF p_count IS NULL OR p_count < 1 OR p_count > 500 THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'Batch count must be between 1 and 500.'
    );
  END IF;

  -- Validate category
  IF p_category NOT IN ('couple', 'stag_male', 'stag_female', 'group', 'vip', 'volunteer', 'complimentary') THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'Invalid category.'
    );
  END IF;

  -- Idempotency check: if key already processed, return existing batch header without creating duplicates
  SELECT id, batch_number, total_count INTO v_batch_id, v_batch_number, v_existing_count
  FROM public.ticket_batches
  WHERE idempotency_key = pg_catalog.trim(p_idempotency_key);

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'batch_id', v_batch_id,
      'batch_number', v_batch_number,
      'total_count', v_existing_count,
      'idempotent_replay', true
    );
  END IF;

  -- Insert Batch Header with concurrent idempotency collision protection
  BEGIN
    INSERT INTO public.ticket_batches (idempotency_key, name, category, total_count, created_by)
    VALUES (pg_catalog.trim(p_idempotency_key), pg_catalog.trim(p_name), p_category, p_count, v_caller_id)
    RETURNING id, batch_number INTO v_batch_id, v_batch_number;
  EXCEPTION WHEN unique_violation THEN
    -- Another concurrent transaction with this idempotency key committed just now
    SELECT id, batch_number, total_count INTO v_batch_id, v_batch_number, v_existing_count
    FROM public.ticket_batches
    WHERE idempotency_key = pg_catalog.trim(p_idempotency_key);

    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'batch_id', v_batch_id,
        'batch_number', v_batch_number,
        'total_count', v_existing_count,
        'idempotent_replay', true
      );
    ELSE
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'error', 'Concurrent batch creation in progress. Please retry.'
      );
    END IF;
  END;

  -- Insert tickets atomically
  FOR i IN 1..p_count LOOP
    -- Generate unique 32-byte hex token (64 hex characters)
    v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

    -- Generate unique 8-char manual code with bounded retry
    v_attempts := 0;
    LOOP
      v_attempts := v_attempts + 1;
      IF v_attempts > 10 THEN
        RAISE EXCEPTION 'Manual code collision retry limit exceeded for batch creation';
      END IF;

      v_manual_code := public.generate_manual_code();
      SELECT EXISTS(
        SELECT 1 FROM public.passes WHERE manual_code = v_manual_code
      ) INTO v_collision;

      IF NOT v_collision THEN
        EXIT;
      END IF;
    END LOOP;

    INSERT INTO public.passes (
      batch_id,
      token,
      manual_code,
      name,
      category,
      status,
      created_by,
      delivery_status
    ) VALUES (
      v_batch_id,
      v_token,
      v_manual_code,
      NULL,
      p_category,
      'unused',
      v_caller_id,
      'not_sent'
    );
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'total_count', p_count,
    'idempotent_replay', false
  );
END;
$$;

-- 10. Hardened Atomic Pass Redemption RPC (Non-Negotiable Invariant)
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
  v_caller_id UUID;
  v_pass RECORD;
  v_cleaned_code TEXT;
  v_canonical_code TEXT;
BEGIN
  -- Verify caller is an authenticated organiser
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organisers WHERE user_id = v_caller_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'UNAUTHORIZED',
      'message', 'Caller is not an authorised organiser.'
    );
  END IF;

  -- Validate input type
  IF p_input_type NOT IN ('qr', 'manual') THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'ERROR',
      'message', 'Invalid input type. Must be "qr" or "manual".'
    );
  END IF;

  -- Lookup pass using exact sargable index query
  IF p_input_type = 'qr' THEN
    SELECT * INTO v_pass
    FROM public.passes
    WHERE token = pg_catalog.trim(p_input_value)
    FOR UPDATE;
  ELSE
    -- Normalise manual code: strip whitespace/hyphens, uppercase
    v_cleaned_code := pg_catalog.upper(
      pg_catalog.regexp_replace(p_input_value, '[^A-Za-z0-9]', '', 'g')
    );

    -- Must be exactly 8 characters
    IF pg_catalog.length(v_cleaned_code) <> 8 THEN
      RETURN pg_catalog.jsonb_build_object('status', 'INVALID');
    END IF;

    -- Format to canonical stored representation (XXXX-XXXX)
    v_canonical_code := pg_catalog.substr(v_cleaned_code, 1, 4) || '-' || pg_catalog.substr(v_cleaned_code, 5, 4);

    -- Exact index seek on uq_passes_manual_code
    SELECT * INTO v_pass
    FROM public.passes
    WHERE manual_code = v_canonical_code
    FOR UPDATE;
  END IF;

  -- 1. Pass not found
  IF v_pass IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'INVALID');
  END IF;

  -- 2. Pass already cancelled
  IF v_pass.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'CANCELLED',
      'pass', pg_catalog.jsonb_build_object(
        'id', v_pass.id,
        'manual_code', v_pass.manual_code,
        'name', pg_catalog.coalesce(v_pass.name, 'Unassigned Ticket'),
        'category', v_pass.category
      )
    );
  END IF;

  -- 3. Pass already used
  IF v_pass.status = 'used' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'ALREADY_USED',
      'used_at', v_pass.used_at,
      'pass', pg_catalog.jsonb_build_object(
        'id', v_pass.id,
        'manual_code', v_pass.manual_code,
        'name', pg_catalog.coalesce(v_pass.name, 'Unassigned Ticket'),
        'category', v_pass.category
      )
    );
  END IF;

  -- 4. Pass is unused -> Atomic transition to used
  UPDATE public.passes
  SET status = 'used',
      used_at = pg_catalog.now()
  WHERE id = v_pass.id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'VALID',
    'used_at', pg_catalog.now(),
    'method', p_input_type,
    'pass', pg_catalog.jsonb_build_object(
      'id', v_pass.id,
      'manual_code', v_pass.manual_code,
      'name', pg_catalog.coalesce(v_pass.name, 'Unassigned Ticket'),
      'category', v_pass.category
    )
  );
END;
$$;

-- Restrict RPC permissions explicitly
REVOKE ALL ON FUNCTION public.create_ticket_batch(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ticket_batch(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_pass(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_pass(TEXT, TEXT) TO authenticated;

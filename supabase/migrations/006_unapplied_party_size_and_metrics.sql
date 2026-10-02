-- ============================================================================
-- MIGRATION 006 (UNAPPLIED): Unbounded Party Size, Scanner Count & Metrics
-- RAAS RANG 2026
--
-- SAFETY NOTICE:
-- This migration is strictly UNAPPLIED to production Supabase.
-- It documents schema updates for unbounded party_size (>= 1),
-- updated admit_pass validation, grouped attendance aggregation RPC,
-- and Realtime publication configuration.
-- ============================================================================

-- 1. Update upper bound on public.passes.party_size to 100
ALTER TABLE public.passes DROP CONSTRAINT IF EXISTS passes_party_size_check;
ALTER TABLE public.passes ADD CONSTRAINT passes_party_size_check CHECK (party_size >= 1 AND party_size <= 100);

-- 2. Update upper bound on public.admissions.people_count to 100
ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS admissions_people_count_check;
ALTER TABLE public.admissions ADD CONSTRAINT admissions_people_count_check CHECK (people_count >= 1 AND people_count <= 100);

-- 3. Update public.admit_pass function to remove hardcoded 10 limit
CREATE OR REPLACE FUNCTION public.admit_pass(
  p_input_type text,
  p_input_value text,
  p_people_count integer,
  p_client_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_pass record;
  v_caller_id uuid;
  v_existing_admission record;
  v_open_night record;
  v_eligible_night record;
  v_admitted_tonight integer := 0;
  v_remaining integer := 0;
  v_cleaned_code text;
  v_canonical_code text;
  v_new_admission_id uuid;
BEGIN
  -- 1. Caller Authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'ERROR', 'message', 'Authentication required.');
  END IF;

  -- 2. Idempotency Check
  IF p_client_request_id IS NULL OR pg_catalog.btrim(p_client_request_id) = '' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'ERROR', 'message', 'Client request ID required.');
  END IF;

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

  -- 3. Validate people count (minimum 1, maximum 100)
  IF p_people_count IS NULL OR p_people_count < 1 OR p_people_count > 100 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'ERROR', 'message', 'Invalid people count (must be between 1 and 100).');
  END IF;

  -- 4. Exclusive row lock on public.passes
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
    VALUES (p_client_request_id, p_input_type, 'INVALID_PASS', p_people_count, v_caller_id);
    RETURN pg_catalog.jsonb_build_object('status', 'INVALID', 'message', 'Pass not found.');
  END IF;

  -- 5. Cancellation check
  IF v_pass.status = 'cancelled' OR v_pass.validity_state = 'cancelled' THEN
    INSERT INTO public.admission_attempts (client_request_id, pass_id, scan_method, rejection_reason, requested_count, scanned_by)
    VALUES (p_client_request_id, v_pass.id, p_input_type, 'PASS_CANCELLED', p_people_count, v_caller_id);
    RETURN pg_catalog.jsonb_build_object('status', 'CANCELLED', 'message', 'Ticket has been cancelled.');
  END IF;

  -- 6. Check for active open event day
  SELECT * INTO v_open_night
  FROM public.event_nights
  WHERE is_active = true
  ORDER BY night_number ASC
  LIMIT 1;

  IF v_open_night.id IS NULL THEN
    INSERT INTO public.admission_attempts (client_request_id, pass_id, scan_method, rejection_reason, requested_count, scanned_by)
    VALUES (p_client_request_id, v_pass.id, p_input_type, 'NO_DAY_ACTIVE', p_people_count, v_caller_id);
    RETURN pg_catalog.jsonb_build_object(
      'status', 'DAY_INACTIVE',
      'message', 'No event day is currently active. Scanning is paused.'
    );
  END IF;

  -- 7. Day eligibility check
  IF v_pass.ticket_type = 'single' THEN
    IF v_pass.valid_night_id IS NOT NULL AND v_pass.valid_night_id <> v_open_night.id THEN
      SELECT * INTO v_eligible_night FROM public.event_nights WHERE id = v_pass.valid_night_id;
      INSERT INTO public.admission_attempts (client_request_id, pass_id, event_night_id, scan_method, rejection_reason, requested_count, scanned_by)
      VALUES (p_client_request_id, v_pass.id, v_open_night.id, p_input_type, 'WRONG_DAY', p_people_count, v_caller_id);
      RETURN pg_catalog.jsonb_build_object(
        'status', 'WRONG_DAY',
        'intended_night', COALESCE(v_eligible_night.title, v_pass.valid_night_id),
        'intended_date', v_eligible_night.event_date,
        'current_night', v_open_night.title,
        'message', format('DO NOT ADMIT — Ticket is for %s, but today is %s.', COALESCE(v_eligible_night.title, v_pass.valid_night_id), v_open_night.title)
      );
    END IF;
  ELSE
    -- Seasonal pass check
    IF EXISTS (SELECT 1 FROM public.pass_eligible_nights WHERE pass_id = v_pass.id) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.pass_eligible_nights
        WHERE pass_id = v_pass.id AND event_night_id = v_open_night.id
      ) THEN
        INSERT INTO public.admission_attempts (client_request_id, pass_id, event_night_id, scan_method, rejection_reason, requested_count, scanned_by)
        VALUES (p_client_request_id, v_pass.id, v_open_night.id, p_input_type, 'SEASONAL_INELIGIBLE_NIGHT', p_people_count, v_caller_id);
        RETURN pg_catalog.jsonb_build_object(
          'status', 'WRONG_DAY',
          'current_night', v_open_night.title,
          'message', 'This seasonal pass is not valid for tonight.'
        );
      END IF;
    END IF;
  END IF;

  -- 8. Remaining allowance calculation for tonight
  SELECT COALESCE(SUM(people_count), 0) INTO v_admitted_tonight
  FROM public.admissions
  WHERE pass_id = v_pass.id AND event_night_id = v_open_night.id;

  v_remaining := v_pass.party_size - v_admitted_tonight;

  IF v_remaining <= 0 THEN
    INSERT INTO public.admission_attempts (client_request_id, pass_id, event_night_id, scan_method, rejection_reason, requested_count, remaining_count, scanned_by)
    VALUES (p_client_request_id, v_pass.id, v_open_night.id, p_input_type, 'ALREADY_SCANNED', p_people_count, 0, v_caller_id);
    RETURN pg_catalog.jsonb_build_object(
      'status', 'ALREADY_SCANNED',
      'remaining_count', 0,
      'message', format('Pass has already reached full attendance allowance (%s people) for %s.', v_pass.party_size, v_open_night.title)
    );
  END IF;

  -- 9. Check requested count against remaining count (no hardcoded 10 limit)
  IF p_people_count > v_remaining THEN
    INSERT INTO public.admission_attempts (client_request_id, pass_id, event_night_id, scan_method, rejection_reason, requested_count, remaining_count, scanned_by)
    VALUES (p_client_request_id, v_pass.id, v_open_night.id, p_input_type, 'TOO_MANY', p_people_count, v_remaining, v_caller_id);
    RETURN pg_catalog.jsonb_build_object(
      'status', 'TOO_MANY',
      'remaining_count', v_remaining,
      'requested_count', p_people_count,
      'message', format('Requested %s exceeds remaining allowance of %s.', p_people_count, v_remaining)
    );
  END IF;

  -- 10. Record Successful Admission
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

  -- Update pass status (only single tickets become permanently 'used' / 'completed')
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
    'admitted_now', p_people_count,
    'remaining_count', v_remaining - p_people_count,
    'party_size', v_pass.party_size,
    'name', v_pass.name,
    'ticket_type', v_pass.ticket_type,
    'category', v_pass.category,
    'current_night', v_open_night.title,
    'message', format('Admitted %s %s.', p_people_count, CASE WHEN p_people_count = 1 THEN 'person' ELSE 'people' END)
  );
END;
$$;

-- 4. View and RPC for Attendance Chart Metrics Grouped by valid_night_id and ticket_type
CREATE OR REPLACE VIEW public.pass_attendance_summary AS
SELECT 
  ticket_type,
  valid_night_id,
  COUNT(*)::INTEGER AS pass_count,
  COALESCE(SUM(party_size), 0)::INTEGER AS total_people
FROM public.passes
WHERE status != 'cancelled'
GROUP BY ticket_type, valid_night_id;

CREATE OR REPLACE FUNCTION public.get_attendance_chart_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'days', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'night_id', n.id,
          'night_number', n.night_number,
          'title', n.title,
          'event_date', n.event_date,
          'is_active', n.is_active,
          'people_count', COALESCE(s.total_people, 0),
          'pass_count', COALESCE(s.pass_count, 0)
        ) ORDER BY n.night_number
      )
      FROM public.event_nights n
      LEFT JOIN (
        SELECT 
          valid_night_id, 
          COUNT(*)::INTEGER AS pass_count,
          SUM(party_size)::INTEGER AS total_people
        FROM public.passes
        WHERE ticket_type = 'single' AND status != 'cancelled' AND valid_night_id IS NOT NULL
        GROUP BY valid_night_id
      ) s ON n.id = s.valid_night_id
    ),
    'seasonal', (
      SELECT jsonb_build_object(
        'people_count', COALESCE(SUM(party_size), 0)::INTEGER,
        'pass_count', COUNT(*)::INTEGER
      )
      FROM public.passes
      WHERE ticket_type = 'seasonal' AND status != 'cancelled'
    ),
    'unassigned', (
      SELECT jsonb_build_object(
        'people_count', COALESCE(SUM(party_size), 0)::INTEGER,
        'pass_count', COUNT(*)::INTEGER
      )
      FROM public.passes
      WHERE ticket_type = 'single' AND status != 'cancelled' AND valid_night_id IS NULL
    ),
    'total_passes', (
      SELECT COUNT(*)::INTEGER FROM public.passes WHERE status != 'cancelled'
    ),
    'total_people', (
      SELECT COALESCE(SUM(party_size), 0)::INTEGER FROM public.passes WHERE status != 'cancelled'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attendance_chart_metrics() TO authenticated;

-- 5. Realtime Publication Setup
-- Enable public.passes table in supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'passes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.passes;
  END IF;
END $$;

-- 6. Confirmed Real Event Night Dates (Day 1 on 11th October 2026, then 9 consecutive days)
UPDATE public.event_nights SET event_date = '2026-10-11', start_time = '2026-10-11T18:00:00+05:30', end_time = '2026-10-11T23:30:00+05:30' WHERE id = 'night_1';
UPDATE public.event_nights SET event_date = '2026-10-12', start_time = '2026-10-12T18:00:00+05:30', end_time = '2026-10-12T23:30:00+05:30' WHERE id = 'night_2';
UPDATE public.event_nights SET event_date = '2026-10-13', start_time = '2026-10-13T18:00:00+05:30', end_time = '2026-10-13T23:30:00+05:30' WHERE id = 'night_3';
UPDATE public.event_nights SET event_date = '2026-10-14', start_time = '2026-10-14T18:00:00+05:30', end_time = '2026-10-14T23:30:00+05:30' WHERE id = 'night_4';
UPDATE public.event_nights SET event_date = '2026-10-15', start_time = '2026-10-15T18:00:00+05:30', end_time = '2026-10-15T23:30:00+05:30' WHERE id = 'night_5';
UPDATE public.event_nights SET event_date = '2026-10-16', start_time = '2026-10-16T18:00:00+05:30', end_time = '2026-10-16T23:30:00+05:30' WHERE id = 'night_6';
UPDATE public.event_nights SET event_date = '2026-10-17', start_time = '2026-10-17T18:00:00+05:30', end_time = '2026-10-17T23:30:00+05:30' WHERE id = 'night_7';
UPDATE public.event_nights SET event_date = '2026-10-18', start_time = '2026-10-18T18:00:00+05:30', end_time = '2026-10-18T23:30:00+05:30' WHERE id = 'night_8';
UPDATE public.event_nights SET event_date = '2026-10-19', start_time = '2026-10-19T18:00:00+05:30', end_time = '2026-10-19T23:30:00+05:30' WHERE id = 'night_9';


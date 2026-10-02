-- ============================================================
-- Migration 005: Pure Admin-Driven Day Activation (No clock timers)
-- Ensures Start Day / End Day directly activate / deactivate tickets.
-- ============================================================

-- 0. Make scan_gate column in admissions nullable (since gate concept was removed)
ALTER TABLE public.admissions ALTER COLUMN scan_gate DROP NOT NULL;
ALTER TABLE public.admissions ALTER COLUMN scan_gate SET DEFAULT 'Main Gate';


-- 1. Helper to get active night purely based on admin toggle
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
  ORDER BY night_number ASC
  LIMIT 1;

  RETURN v_night;
END;
$$;

-- 2. Update preview_ticket_allowance to purely use is_active = true
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

  -- Identify active event night purely from admin status toggle
  SELECT * INTO v_open_night
  FROM public.event_nights
  WHERE is_active = true
  ORDER BY night_number ASC
  LIMIT 1;

  -- Handle Seasonal Passes: strictly require active open night and check pass_eligible_nights
  IF v_pass.ticket_type = 'seasonal' THEN
    IF v_open_night.id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'OUTSIDE_EVENT_WINDOW',
        'message', 'No event night is currently active. Start the day in Admin to enable gate scanning.',
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
    IF v_pass.valid_night_id IS NOT NULL THEN
      SELECT * INTO v_valid_night FROM public.event_nights WHERE id = v_pass.valid_night_id;
      RETURN pg_catalog.jsonb_build_object(
        'status', 'OUTSIDE_EVENT_WINDOW',
        'message', 'No event night is currently active. Start the day in Admin to enable gate scanning.',
        'name', COALESCE(v_pass.name, 'Unassigned Ticket'),
        'ticket_type', 'single',
        'party_size', v_pass.party_size,
        'intended_night', COALESCE(v_valid_night.title, 'Unknown')
      );
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'OUTSIDE_EVENT_WINDOW',
      'message', 'No event night is currently active. Start the day in Admin to enable gate scanning.',
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

-- 3. Update admit_pass to purely use is_active = true
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
    VALUES (p_client_request_id, p_input_type, 'INVALID', p_people_count, v_caller_id);
    RETURN pg_catalog.jsonb_build_object('status', 'INVALID');
  END IF;

  -- 5. Check cancellation / activation
  IF v_pass.status = 'cancelled' OR v_pass.validity_state = 'cancelled' THEN
    INSERT INTO public.admission_attempts (client_request_id, pass_id, scan_method, rejection_reason, requested_count, scanned_by)
    VALUES (p_client_request_id, v_pass.id, p_input_type, 'CANCELLED', p_people_count, v_caller_id);
    RETURN pg_catalog.jsonb_build_object('status', 'CANCELLED', 'name', COALESCE(v_pass.name, 'Unassigned Ticket'));
  END IF;

  -- 6. Identify open event night purely from admin status toggle
  SELECT * INTO v_open_night
  FROM public.event_nights
  WHERE is_active = true
  ORDER BY night_number ASC
  LIMIT 1;

  -- 7. Seasonal Pass Check
  IF v_pass.ticket_type = 'seasonal' THEN
    IF v_open_night.id IS NULL THEN
      INSERT INTO public.admission_attempts (client_request_id, pass_id, scan_method, rejection_reason, requested_count, scanned_by)
      VALUES (p_client_request_id, v_pass.id, p_input_type, 'OUTSIDE_EVENT_WINDOW', p_people_count, v_caller_id);
      RETURN pg_catalog.jsonb_build_object(
        'status', 'OUTSIDE_EVENT_WINDOW',
        'message', 'No event night is currently active. Start the day in Admin to enable gate scanning.'
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
        'message', 'No event night is currently active. Start the day in Admin to enable gate scanning.',
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

    -- 8c. Correct day or legacy pass: check total admissions
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

  -- 9. Strict Group Limit Check
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

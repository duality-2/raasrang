-- 007: Payment details captured when issuing a ticket
-- amount_received: amount (INR) typed in manually by the issuer
-- payment_mode:    'cash' or 'online'
-- Both are nullable so that historical passes (issued before this migration) remain valid.

ALTER TABLE public.passes
  ADD COLUMN IF NOT EXISTS amount_received numeric(10, 2),
  ADD COLUMN IF NOT EXISTS payment_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'passes_payment_mode_check'
  ) THEN
    ALTER TABLE public.passes
      ADD CONSTRAINT passes_payment_mode_check
      CHECK (payment_mode IS NULL OR payment_mode IN ('cash', 'online'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'passes_amount_received_check'
  ) THEN
    ALTER TABLE public.passes
      ADD CONSTRAINT passes_amount_received_check
      CHECK (amount_received IS NULL OR amount_received >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.passes.amount_received IS 'Amount received (INR) at the time of issuing the ticket';
COMMENT ON COLUMN public.passes.payment_mode IS 'Payment mode at issuance: cash | online';

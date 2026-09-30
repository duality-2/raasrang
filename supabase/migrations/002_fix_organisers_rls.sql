-- Fix RLS policy so authenticated users can read their own row in public.organisers.
-- Without this, the EXISTS (SELECT 1 FROM public.organisers WHERE user_id = auth.uid()) check
-- in the passes table policy fails because RLS blocks access to public.organisers.

CREATE POLICY "Users can check their own organiser status"
  ON public.organisers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

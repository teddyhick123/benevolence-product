-- Simple RLS policies for holding_contributions (allows all operations for now)
-- You can tighten these later based on your authentication setup

-- Drop existing policies if any
DROP POLICY IF EXISTS "holding_contributions_insert_policy" ON public.holding_contributions;
DROP POLICY IF EXISTS "holding_contributions_select_policy" ON public.holding_contributions;
DROP POLICY IF EXISTS "holding_contributions_update_policy" ON public.holding_contributions;
DROP POLICY IF EXISTS "holding_contributions_delete_policy" ON public.holding_contributions;
DROP POLICY IF EXISTS "holding_contributions_anon_select_policy" ON public.holding_contributions;

-- Allow all operations for authenticated users
CREATE POLICY "holding_contributions_all_authenticated"
ON public.holding_contributions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow all operations for anon users (for development)
CREATE POLICY "holding_contributions_all_anon"
ON public.holding_contributions
FOR ALL
TO anon
USING (true)
WITH CHECK (true);
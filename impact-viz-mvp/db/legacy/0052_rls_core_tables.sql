-- Enable RLS on core tables that were previously unprotected

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_settings ENABLE ROW LEVEL SECURITY;

-- portfolios: members can select
DROP POLICY IF EXISTS "portfolios_select_member" ON public.portfolios;
CREATE POLICY "portfolios_select_member"
  ON public.portfolios FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members
      WHERE portfolio_id = portfolios.id
        AND user_id = auth.uid()
    )
  );

-- profiles: own row only (select)
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- profiles: own row only (update)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- portfolio_settings: portfolio member (select)
DROP POLICY IF EXISTS "portfolio_settings_select_member" ON public.portfolio_settings;
CREATE POLICY "portfolio_settings_select_member"
  ON public.portfolio_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members
      WHERE portfolio_id = portfolio_settings.portfolio_id
        AND user_id = auth.uid()
    )
  );

-- portfolio_settings: portfolio member (update)
DROP POLICY IF EXISTS "portfolio_settings_update_member" ON public.portfolio_settings;
CREATE POLICY "portfolio_settings_update_member"
  ON public.portfolio_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members
      WHERE portfolio_id = portfolio_settings.portfolio_id
        AND user_id = auth.uid()
    )
  );

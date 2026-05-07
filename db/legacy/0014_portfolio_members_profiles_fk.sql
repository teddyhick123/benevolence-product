-- Add foreign key relationship from portfolio_members to profiles
-- This allows Supabase to properly join portfolio_members with profiles

-- First, ensure all user_ids in portfolio_members exist in profiles
-- (create any missing profile rows)
INSERT INTO public.profiles (user_id)
SELECT DISTINCT pm.user_id
FROM public.portfolio_members pm
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = pm.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- Now add the foreign key constraint
ALTER TABLE public.portfolio_members
  ADD CONSTRAINT portfolio_members_profiles_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(user_id);

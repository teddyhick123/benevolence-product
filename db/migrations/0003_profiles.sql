-- =============================================================================
-- 0003_profiles.sql
-- User profiles — one row per auth.users row, auto-created on signup.
-- Stores display info only; auth state lives in auth.users.
-- Depends on: 0001, 0002
-- =============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  email           text,
  full_name       text,
  avatar_url      text,
  phone           text,

  -- UI preferences
  preferences     jsonb NOT NULL DEFAULT '{}',
  -- e.g. { "theme": "dark", "default_org_id": "...", "notifications": { "email": true } }

  -- Last active org (convenience, not authoritative — org membership is in organization_members)
  last_org_id     uuid REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX idx_profiles_email       ON profiles (email) WHERE email IS NOT NULL;
CREATE INDEX idx_profiles_last_org_id ON profiles (last_org_id) WHERE last_org_id IS NOT NULL;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS: profiles
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can always read and update their own profile
CREATE POLICY "profiles: own profile"
  ON profiles FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Org members can read profiles of co-members (for display names, avatars)
CREATE POLICY "profiles: readable by org co-members"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om1
      JOIN organization_members om2
        ON om2.org_id  = om1.org_id
       AND om2.user_id = auth.uid()
       AND om2.deleted_at IS NULL
      WHERE om1.user_id    = profiles.id
        AND om1.deleted_at IS NULL
    )
  );

CREATE POLICY "profiles: service role can manage"
  ON profiles FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT ALL ON profiles TO service_role;

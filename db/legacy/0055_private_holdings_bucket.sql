-- Make holdings bucket private
UPDATE storage.buckets SET public = false WHERE id = 'holdings';

-- Drop the public read policy
DROP POLICY IF EXISTS "holdings_read_public" ON storage.objects;

-- Add authenticated-only read policy (requires signed URLs)
DROP POLICY IF EXISTS "holdings_read_authenticated" ON storage.objects;
CREATE POLICY "holdings_read_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'holdings' AND (storage.foldername(name))[1] != 'public');

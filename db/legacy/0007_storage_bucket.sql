-- Create storage bucket for holding-related files
INSERT INTO storage.buckets (id, name, public)
VALUES ('holdings', 'holdings', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for the holdings bucket
-- Allow authenticated users to upload
CREATE POLICY "holdings_upload_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'holdings');

-- Allow anyone to read (since it's public)
CREATE POLICY "holdings_read_public"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'holdings');

-- Allow authenticated users to update their own uploads
CREATE POLICY "holdings_update_authenticated"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'holdings')
WITH CHECK (bucket_id = 'holdings');

-- Allow authenticated users to delete
CREATE POLICY "holdings_delete_authenticated"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'holdings');
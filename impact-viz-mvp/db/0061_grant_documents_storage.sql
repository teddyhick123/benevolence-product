-- Migration: Grant Documents Storage
-- Description: Create private storage bucket for grant documents with RLS policies
-- Date: 2026-03-03

-- Create private bucket for grant documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('grant-documents', 'grant-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their portfolio's folder
CREATE POLICY "grant_docs_upload_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'grant-documents'
  AND EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.portfolio_id = (storage.foldername(name))[1]::uuid
    AND pm.role IN ('owner', 'admin', 'editor')
  )
);

-- Allow members to read documents from portfolios they have access to
CREATE POLICY "grant_docs_read_member"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'grant-documents'
  AND EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.portfolio_id = (storage.foldername(name))[1]::uuid
  )
);

-- Allow editors to update documents
CREATE POLICY "grant_docs_update_editor"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'grant-documents'
  AND EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.portfolio_id = (storage.foldername(name))[1]::uuid
    AND pm.role IN ('owner', 'admin', 'editor')
  )
)
WITH CHECK (
  bucket_id = 'grant-documents'
  AND EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.portfolio_id = (storage.foldername(name))[1]::uuid
    AND pm.role IN ('owner', 'admin', 'editor')
  )
);

-- Allow editors to delete documents
CREATE POLICY "grant_docs_delete_editor"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'grant-documents'
  AND EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.portfolio_id = (storage.foldername(name))[1]::uuid
    AND pm.role IN ('owner', 'admin', 'editor')
  )
);

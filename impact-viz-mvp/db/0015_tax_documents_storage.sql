-- Create storage bucket for tax documents (receipts, acknowledgments, appraisals)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tax-documents', 'tax-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for tax-documents bucket
-- These are restricted to authenticated users who have access to the portfolio

-- Allow authenticated users to upload to their portfolio's folder
CREATE POLICY "tax_docs_upload_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tax-documents'
  AND EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.portfolio_id = (storage.foldername(name))[1]::uuid
    AND pm.role IN ('owner', 'admin', 'editor')
  )
);

-- Allow users to read documents from portfolios they have access to
CREATE POLICY "tax_docs_read_member"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.portfolio_id = (storage.foldername(name))[1]::uuid
  )
);

-- Allow users to update documents in portfolios they can edit
CREATE POLICY "tax_docs_update_editor"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.portfolio_id = (storage.foldername(name))[1]::uuid
    AND pm.role IN ('owner', 'admin', 'editor')
  )
)
WITH CHECK (
  bucket_id = 'tax-documents'
  AND EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.portfolio_id = (storage.foldername(name))[1]::uuid
    AND pm.role IN ('owner', 'admin', 'editor')
  )
);

-- Allow users to delete documents from portfolios they can edit
CREATE POLICY "tax_docs_delete_editor"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.portfolio_id = (storage.foldername(name))[1]::uuid
    AND pm.role IN ('owner', 'admin', 'editor')
  )
);

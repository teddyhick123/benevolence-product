-- Migration: Compliance Documents Storage Bucket
-- Description: Private bucket for filing calendar attachment uploads
-- Date: 2026-06-13

INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-documents', 'compliance-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies before recreating (idempotent re-run safety)
DROP POLICY IF EXISTS "compliance_documents_upload"  ON storage.objects;
DROP POLICY IF EXISTS "compliance_documents_read"    ON storage.objects;
DROP POLICY IF EXISTS "compliance_documents_service" ON storage.objects;

-- Read: org member can download their org's files (path format: orgId/filingId/file)
CREATE POLICY "compliance_documents_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'compliance-documents'
    AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id::text = split_part(storage.objects.name, '/', 1)
        AND user_id = auth.uid()
    )
  );

-- Upload: user must be org admin for the org in the path prefix
CREATE POLICY "compliance_documents_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'compliance-documents'
    AND public.is_org_admin(
      (split_part(name, '/', 1))::uuid
    )
  );

-- Service role: full access (used by createAdminClient)
CREATE POLICY "compliance_documents_service"
  ON storage.objects FOR ALL TO service_role
  USING  (bucket_id = 'compliance-documents')
  WITH CHECK (bucket_id = 'compliance-documents');

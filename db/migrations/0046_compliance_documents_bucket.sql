-- Migration: Compliance Documents Storage Bucket
-- Description: Private bucket for filing calendar attachment uploads
-- Date: 2026-06-13

INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-documents', 'compliance-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "compliance_documents_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'compliance-documents');

CREATE POLICY "compliance_documents_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'compliance-documents');

CREATE POLICY "compliance_documents_service"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'compliance-documents')
  WITH CHECK (bucket_id = 'compliance-documents');

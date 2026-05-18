'use client';

import { useState, useEffect } from 'react';
import { DOCUMENT_TYPE_LABELS } from '@/lib/tax/constants';

interface TaxDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
  signed_url?: string;
}

interface DocumentsListProps {
  portfolioId: string;
  contributionId: string;
  refreshTrigger?: number;
  onDocumentsChange?: (docs: TaxDocument[]) => void;
}

export default function DocumentsList({
  portfolioId,
  contributionId,
  refreshTrigger,
  onDocumentsChange,
}: DocumentsListProps) {
  const [documents, setDocuments] = useState<TaxDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDocuments() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/portfolio/${portfolioId}/tax/contributions/${contributionId}/documents`
        );

        if (!res.ok) throw new Error('Failed to fetch documents');

        const json = await res.json();
        setDocuments(json.data || []);
        onDocumentsChange?.(json.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchDocuments();
  }, [portfolioId, contributionId, refreshTrigger, onDocumentsChange]);

  async function handleDelete(docId: string) {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      setDeleting(docId);
      const res = await fetch(
        `/api/portfolio/${portfolioId}/tax/contributions/${contributionId}/documents/${docId}`,
        { method: 'DELETE' }
      );

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to delete');
      }

      const updated = documents.filter((d) => d.id !== docId);
      setDocuments(updated);
      onDocumentsChange?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  async function handleView(doc: TaxDocument) {
    try {
      // Get a signed URL for viewing
      const res = await fetch(
        `/api/portfolio/${portfolioId}/tax/contributions/${contributionId}/documents/${doc.id}`
      );

      if (!res.ok) throw new Error('Failed to get document URL');

      const json = await res.json();
      const url = json.data?.signed_url;

      if (url) {
        window.open(url, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open document');
    }
  }

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string | null) => {
    if (mimeType === 'application/pdf') {
      return (
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    if (mimeType?.startsWith('image/')) {
      return (
        <svg className="w-5 h-5 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded"></div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        No documents uploaded yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {getFileIcon(doc.mime_type)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {doc.file_name}
              </p>
              <p className="text-xs text-gray-500">
                {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type} •{' '}
                {formatFileSize(doc.file_size_bytes)} •{' '}
                {new Date(doc.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={() => handleView(doc)}
              className="p-2 text-azure hover:bg-azure/10 rounded-md transition-colors"
              title="View document"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
            <button
              onClick={() => handleDelete(doc.id)}
              disabled={deleting === doc.id}
              className="p-2 text-red-600 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50"
              title="Delete document"
            >
              {deleting === doc.id ? (
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

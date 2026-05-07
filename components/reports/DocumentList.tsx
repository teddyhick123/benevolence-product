'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';

type GeneratedDocument = {
  id: string;
  title: string;
  document_type: string;
  format: string;
  scope: string;
  status: string;
  is_public: boolean;
  share_token: string | null;
  file_size_bytes: number | null;
  generated_at: string;
  expires_at: string | null;
  template_name: string | null;
  holding_name: string | null;
  sector: string | null;
};

interface Props {
  portfolioId: string;
  onView?: (documentId: string) => void;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function DocumentList({ portfolioId, onView }: Props) {
  const [typeFilter, setTypeFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const queryParams = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (typeFilter) queryParams.set('type', typeFilter);
  if (formatFilter) queryParams.set('format', formatFilter);

  const { data, error, isLoading } = useSWR<{ documents: GeneratedDocument[]; count: number; nextOffset: number | null }>(
    `/api/portfolio/${portfolioId}/reports/documents?${queryParams}`,
    fetcher
  );

  const documents = data?.documents ?? [];
  const totalCount = data?.count ?? 0;

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      report: 'bg-indigo-100 text-indigo-800',
      export: 'bg-amber-100 text-amber-800',
      summary: 'bg-teal-100 text-teal-800',
      custom: 'bg-gray-100 text-gray-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getScopeBadge = (scope: string) => {
    const colors: Record<string, string> = {
      portfolio: 'bg-blue-100 text-blue-800',
      holding: 'bg-green-100 text-green-800',
      sector: 'bg-purple-100 text-purple-800',
      organization: 'bg-orange-100 text-orange-800',
    };
    return colors[scope] || 'bg-gray-100 text-gray-800';
  };

  const handleArchive = async (documentId: string) => {
    try {
      await fetch(`/api/portfolio/${portfolioId}/reports/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      mutate(`/api/portfolio/${portfolioId}/reports/documents?${queryParams}`);
    } catch (err) {
      console.error('Failed to archive document:', err);
    }
  };

  const handleTogglePublic = async (documentId: string, isPublic: boolean) => {
    try {
      await fetch(`/api/portfolio/${portfolioId}/reports/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !isPublic }),
      });
      mutate(`/api/portfolio/${portfolioId}/reports/documents?${queryParams}`);
    } catch (err) {
      console.error('Failed to toggle public:', err);
    }
  };

  const copyShareLink = (shareToken: string) => {
    const url = `${window.location.origin}/shared/report/${shareToken}`;
    navigator.clipboard.writeText(url);
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg">
        Failed to load documents
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setOffset(0); }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Types</option>
          <option value="report">Reports</option>
          <option value="export">Exports</option>
          <option value="summary">Summaries</option>
        </select>

        <select
          value={formatFilter}
          onChange={(e) => { setFormatFilter(e.target.value); setOffset(0); }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Formats</option>
          <option value="html">HTML</option>
          <option value="pdf">PDF</option>
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
          <option value="xlsx">Excel</option>
        </select>

        {(typeFilter || formatFilter) && (
          <button
            onClick={() => { setTypeFilter(''); setFormatFilter(''); setOffset(0); }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Count */}
      <div className="text-sm text-gray-500">
        Showing {documents.length} of {totalCount} documents
      </div>

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg border border-gray-200">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="font-medium">No documents found</p>
          <p className="text-sm mt-1">Generate reports or export data to see them here</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Format
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Generated
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <button
                        onClick={() => onView?.(doc.id)}
                        className="text-sm font-medium text-gray-900 hover:text-azure"
                      >
                        {doc.title}
                      </button>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getScopeBadge(doc.scope)}`}>
                          {doc.scope}
                        </span>
                        {doc.is_public && (
                          <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                            Public
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getTypeBadge(doc.document_type)}`}>
                      {doc.document_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 uppercase">
                    {doc.format}
                    {doc.file_size_bytes && (
                      <span className="text-gray-400 ml-1">({formatFileSize(doc.file_size_bytes)})</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDate(doc.generated_at)}
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      {onView && (
                        <button
                          onClick={() => onView(doc.id)}
                          className="text-azure hover:underline"
                        >
                          View
                        </button>
                      )}
                      <button
                        onClick={() => handleTogglePublic(doc.id, doc.is_public)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        {doc.is_public ? 'Make Private' : 'Share'}
                      </button>
                      {doc.is_public && doc.share_token && (
                        <button
                          onClick={() => copyShareLink(doc.share_token!)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Copy Link
                        </button>
                      )}
                      <button
                        onClick={() => handleArchive(doc.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalCount > limit && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {Math.floor(offset / limit) + 1} of {Math.ceil(totalCount / limit)}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={!data?.nextOffset}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

import { apiRequest, readJson, uploadJson } from "@/lib/api/client";

import { useState, useRef, useCallback, useEffect } from 'react';

interface GrantDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  signed_url: string | null;
  created_at: string;
}

interface Props {
  grantId: string;
  portfolioId: string;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  proposal: 'Proposal',
  agreement: 'Grant Agreement',
  amendment: 'Amendment',
  report: 'Report',
  correspondence: 'Correspondence',
};

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];
const MAX_SIZE_MB = 10;

export default function DocumentManager({ grantId, portfolioId }: Props) {
  const [documents, setDocuments] = useState<GrantDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('proposal');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await apiRequest(`/api/portfolio/${portfolioId}/grants/${grantId}/documents`);
      if (!res.ok) throw new Error('Failed to load documents');
      const json = await readJson(res);
      setDocuments(json.data || []);
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  }, [portfolioId, grantId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'File type not allowed. Please upload PDF, DOCX, XLSX, or an image.';
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File size must be less than ${MAX_SIZE_MB}MB.`;
    }
    return null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setError(null);
    const file = e.dataTransfer.files[0];
    if (file) {
      const err = validateFile(file);
      if (err) { setError(err); return; }
      setSelectedFile(file);
    }
  }, [validateFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (file) {
      const err = validateFile(file);
      if (err) { setError(err); return; }
      setSelectedFile(file);
    }
  }, [validateFile]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    try {
      setUploading(true);
      setError(null);
      setProgress(20);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('document_type', documentType);

      setProgress(50);

      await uploadJson(
        `/api/portfolio/${portfolioId}/grants/${grantId}/documents`,
        formData,
        { method: 'POST' }
      );

      setProgress(90);

      setProgress(100);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDelete = async (doc: GrantDocument) => {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    setDeletingId(doc.id);
    try {
      const res = await apiRequest(
        `/api/portfolio/${portfolioId}/grants/${grantId}/documents?documentId=${doc.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const json = await readJson(res);
        throw new Error(json.error || 'Delete failed');
      }
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const getDocTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      proposal: 'bg-azure/10 text-azure-deep border border-azure/20',
      agreement: 'bg-green-50 text-green-700 border border-green-100',
      amendment: 'bg-sunset/15 text-ink border border-sunset/30',
      report: 'bg-coral/10 text-coral border border-coral/25',
      correspondence: 'bg-neutral-100 text-neutral-700 border border-black/5',
    };
    return colors[type] || 'bg-neutral-100 text-neutral-700 border border-black/5';
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-6">
        <h3 className="text-sm font-semibold text-ink mb-4">Upload Document</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-700 mb-1">Document Type</label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            disabled={uploading}
            className="w-full px-3 py-2 border border-black/10 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
          >
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {!selectedFile ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-azure bg-azure/10' : 'border-black/10 hover:border-azure/40 hover:bg-neutral-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp,.heic"
              onChange={handleFileSelect}
              className="hidden"
            />
            <svg className="mx-auto h-10 w-10 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mt-2 text-sm text-neutral-600">
              <span className="font-medium text-azure">Click to upload</span> or drag and drop
            </p>
            <p className="mt-1 text-xs text-neutral-500">PDF, DOCX, XLSX, or image up to {MAX_SIZE_MB}MB</p>
          </div>
        ) : (
          <div className="border border-black/5 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-azure/10 rounded-2xl">
                  <svg className="w-5 h-5 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink truncate max-w-xs">{selectedFile.name}</p>
                  <p className="text-xs text-neutral-500">{formatFileSize(selectedFile.size)}</p>
                </div>
              </div>
              {!uploading && (
                <button onClick={() => { setSelectedFile(null); setError(null); }} className="text-neutral-400 hover:text-neutral-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {uploading && (
              <div className="mt-3">
                <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                  <div className="h-full bg-azure transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-neutral-500 mt-1">Uploading... {progress}%</p>
              </div>
            )}

            {!uploading && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleUpload}
                  className="flex-1 px-4 py-2 bg-azure text-white rounded-2xl hover:opacity-90 font-medium text-sm"
                >
                  Upload {DOCUMENT_TYPE_LABELS[documentType]}
                </button>
                <button
                  onClick={() => { setSelectedFile(null); setError(null); }}
                  className="px-4 py-2 border border-black/10 text-neutral-700 rounded-2xl hover:bg-neutral-50 text-sm"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">{error}</div>
        )}
      </div>

      {/* Document List */}
      <div className="rounded-2xl border border-black/5 bg-white shadow-soft overflow-hidden">
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Documents</h3>
          <span className="text-sm text-neutral-500">{documents.length} files</span>
        </div>

        {loading ? (
          <div className="p-6 text-center text-neutral-500 text-sm">Loading...</div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="mx-auto h-10 w-10 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-2 text-sm text-neutral-500">No documents uploaded yet.</p>
            <p className="text-xs text-neutral-400">Upload documents using the form above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-black/5">
            {documents.map((doc) => (
              <li key={doc.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-neutral-50 rounded-2xl flex-shrink-0">
                    <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDocTypeColor(doc.document_type)}`}>
                        {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}
                      </span>
                      <span className="text-xs text-neutral-400">{formatFileSize(doc.file_size)}</span>
                      <span className="text-xs text-neutral-400">{formatDate(doc.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {doc.signed_url && (
                    <a
                      href={doc.signed_url}
                      download={doc.file_name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-neutral-400 hover:text-azure rounded-full hover:bg-azure/10"
                      title="Download"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={deletingId === doc.id}
                    className="p-1.5 text-neutral-400 hover:text-red-500 rounded-full hover:bg-red-50 disabled:opacity-50"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

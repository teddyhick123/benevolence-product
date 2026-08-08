'use client';

import { uploadJson } from "@/lib/api/client";

import { useState, useRef, useCallback } from 'react';
import { DOCUMENT_TYPE_LABELS } from '@/lib/tax/constants';
import type { DocumentType } from '@/lib/schemas/tax';

interface DocumentUploaderProps {
  portfolioId: string;
  contributionId: string;
  onUploadComplete: () => void;
  suggestedType?: DocumentType;
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_SIZE_MB = 10;

export default function DocumentUploader({
  portfolioId,
  contributionId,
  onUploadComplete,
  suggestedType,
}: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>(suggestedType || 'receipt');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'File type not allowed. Please upload PDF, JPEG, PNG, or WebP.';
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

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setSelectedFile(file);
    }
  }, [validateFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setSelectedFile(file);
    }
  }, [validateFile]);

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setError(null);
      setProgress(10);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('document_type', documentType);

      setProgress(30);

      await uploadJson(
        `/api/portfolio/${portfolioId}/tax/contributions/${contributionId}/documents`,
        formData,
        { method: 'POST' }
      );

      setProgress(80);

      setProgress(100);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onUploadComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Document Type Selector */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Document Type
        </label>
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value as DocumentType)}
          disabled={uploading}
          className="w-full px-3 py-2 border border-black/10 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
        >
          {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Drop Zone */}
      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors
            ${isDragging
              ? 'border-azure bg-azure/10'
              : 'border-black/10 hover:border-azure/40 hover:bg-neutral-50'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
            onChange={handleFileSelect}
            className="hidden"
          />
          <svg
            className="mx-auto h-12 w-12 text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="mt-2 text-sm text-neutral-600">
            <span className="font-medium text-azure">Click to upload</span> or drag and drop
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            PDF, JPEG, PNG, or WebP up to {MAX_SIZE_MB}MB
          </p>
        </div>
      ) : (
        /* Selected File Preview */
        <div className="border border-black/5 rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-azure/10 rounded-2xl">
                {selectedFile.type === 'application/pdf' ? (
                  <svg className="w-6 h-6 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-ink truncate max-w-xs">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            {!uploading && (
              <button
                onClick={handleCancel}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Progress Bar */}
          {uploading && (
            <div className="mt-3">
              <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-azure transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-neutral-500 mt-1">Uploading... {progress}%</p>
            </div>
          )}

          {/* Upload Button */}
          {!uploading && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleUpload}
                className="flex-1 px-4 py-2 bg-azure text-white rounded-2xl hover:opacity-90 font-medium text-sm"
              >
                Upload {DOCUMENT_TYPE_LABELS[documentType]}
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 border border-black/10 text-neutral-700 rounded-2xl hover:bg-neutral-50 text-sm"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

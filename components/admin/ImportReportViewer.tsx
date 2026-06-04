'use client';
// components/admin/ImportReportViewer.tsx
// AI-generated migration report viewer

import { useState } from 'react';

interface ImportReportViewerProps {
  importJobId: string;
}

export function ImportReportViewer({ importJobId }: ImportReportViewerProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReport = async () => {
    setLoadingReport(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/imports/${importJobId}/report?format=markdown`);
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? 'Failed to generate report');
      }
      const data = await res.json() as { markdown?: string };
      setMarkdown(data.markdown ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingReport(false);
    }
  };

  const downloadMarkdown = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `migration-report-${importJobId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const downloadPDF = async () => {
    setLoadingPDF(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/imports/${importJobId}/report?format=pdf`);
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? 'Failed to generate PDF');
      }
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="?(.+?)"?$/);
      const filename = match?.[1] ?? `migration-report-${importJobId}.pdf`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingPDF(false);
    }
  };

  // Minimal markdown renderer (headings, bold, blockquotes, tables, lists, code)
  const renderMarkdown = (md: string): string => {
    return md
      .split('\n')
      .map((line) => {
        // Headings
        if (line.startsWith('### ')) return `<h3 class="text-base font-semibold mt-4 mb-1">${esc(line.slice(4))}</h3>`;
        if (line.startsWith('## ')) return `<h2 class="text-lg font-semibold mt-6 mb-2 border-b border-neutral-200 pb-1">${esc(line.slice(3))}</h2>`;
        if (line.startsWith('# ')) return `<h1 class="text-2xl font-bold mb-4">${esc(line.slice(2))}</h1>`;
        // Blockquote
        if (line.startsWith('> ')) return `<blockquote class="border-l-4 border-azure pl-4 py-1 my-2 bg-azure/5 text-neutral-700 italic text-sm">${inlineFormat(line.slice(2))}</blockquote>`;
        // Table row — skip separator lines (e.g. |---|---|)
        if (line.startsWith('|')) {
          const cells = line.split('|').filter(Boolean).map(c => c.trim());
          const isSeparator = cells.every(c => /^[-: ]+$/.test(c));
          if (isSeparator) return '';
          return `<tr>${cells.map(cell =>
            `<td class="border border-neutral-200 px-3 py-1.5 text-sm">${inlineFormat(cell)}</td>`
          ).join('')}</tr>`;
        }
        // List item
        if (line.startsWith('- ') || line.startsWith('* ')) return `<li class="ml-4 text-sm list-disc">${inlineFormat(line.slice(2))}</li>`;
        if (/^\d+\. /.test(line)) return `<li class="ml-4 text-sm list-decimal">${inlineFormat(line.replace(/^\d+\. /, ''))}</li>`;
        // Horizontal rule
        if (/^---+$/.test(line.trim())) return '<hr class="my-4 border-neutral-200" />';
        // Empty line
        if (line.trim() === '') return '<br />';
        // Paragraph
        return `<p class="text-sm leading-relaxed">${inlineFormat(line)}</p>`;
      })
      .join('\n');
  };

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inlineFormat(s: string): string {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-neutral-100 px-1 rounded text-xs font-mono">$1</code>');
  }

  return (
    <div className="space-y-4">
      {!markdown && (
        <div className="text-center py-12">
          <p className="text-neutral-500 text-sm mb-4">
            Generate a professional migration report to share with your board.
          </p>
          <button
            onClick={generateReport}
            disabled={loadingReport}
            className="px-5 py-2.5 bg-azure text-white rounded-2xl text-sm font-medium hover:bg-azure/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingReport ? 'AI is writing your report...' : 'Generate Migration Report'}
          </button>
          {loadingReport && (
            <p className="mt-3 text-xs text-neutral-400 animate-pulse">
              This takes about 10-15 seconds...
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
          {error}
        </div>
      )}

      {markdown && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">Report generated successfully</p>
            <div className="flex gap-2">
              <button
                onClick={generateReport}
                disabled={loadingReport}
                className="text-xs px-3 py-1.5 border border-neutral-200 rounded-2xl hover:bg-neutral-50 disabled:opacity-40 transition-colors"
              >
                {loadingReport ? 'Regenerating...' : 'Regenerate'}
              </button>
              <button
                onClick={downloadMarkdown}
                className="text-xs px-3 py-1.5 border border-neutral-200 rounded-2xl hover:bg-neutral-50 transition-colors"
              >
                Download .md
              </button>
              <button
                onClick={downloadPDF}
                disabled={loadingPDF}
                className="text-xs px-3 py-1.5 border border-azure/30 text-azure rounded-2xl hover:bg-azure/5 disabled:opacity-40 transition-colors"
              >
                {loadingPDF ? 'Generating PDF...' : 'Download PDF'}
              </button>
              <button
                onClick={handlePrint}
                className="text-xs px-3 py-1.5 border border-azure/30 text-azure rounded-2xl hover:bg-azure/5 transition-colors"
              >
                Print
              </button>
            </div>
          </div>

          <div
            id="migration-report"
            className="bg-white border border-neutral-200 rounded-2xl p-8 max-w-4xl mx-auto prose-sm print:border-0 print:shadow-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
          />

          <style>{`
            @media print {
              body > *:not(#migration-report) { display: none !important; }
              #migration-report { margin: 0; padding: 1rem; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}

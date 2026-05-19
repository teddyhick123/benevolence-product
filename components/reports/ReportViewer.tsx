'use client';

import { useState } from 'react';
import InlineWidget from '@/components/ui/InlineWidget';

type ContentBlock = {
  type: 'text' | 'chart';
  content?: string;
  widget?: {
    id: string;
    type: string;
    title: string;
    config: any;
  };
};

type ReportData = {
  title: string;
  scope: string;
  content_blocks: ContentBlock[];
  time_range: string;
  generated_at: string;
};

interface Props {
  report: ReportData;
  portfolioId: string;
  onClose?: () => void;
  onShare?: () => void;
  onExport?: (format: string) => void;
}

export default function ReportViewer({ report, portfolioId, onClose, onShare, onExport }: Props) {
  const [showShareModal, setShowShareModal] = useState(false);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeRangeLabel = (range: string) => {
    const labels: Record<string, string> = {
      '3m': 'Last 3 Months',
      '6m': 'Last 6 Months',
      '12m': 'Last 12 Months',
      'ytd': 'Year to Date',
      'all': 'All Time',
    };
    return labels[range] || range;
  };

  const renderContent = (block: ContentBlock, index: number) => {
    if (block.type === 'text' && block.content) {
      // Simple markdown-like rendering
      const lines = block.content.split('\n');
      return (
        <div key={index} className="prose prose-sm max-w-none">
          {lines.map((line, i) => {
            if (line.startsWith('# ')) {
              return <h1 key={i} className="text-2xl font-bold text-gray-900 mt-6 mb-4">{line.slice(2)}</h1>;
            }
            if (line.startsWith('## ')) {
              return <h2 key={i} className="text-xl font-semibold text-gray-900 mt-6 mb-3">{line.slice(3)}</h2>;
            }
            if (line.startsWith('### ')) {
              return <h3 key={i} className="text-lg font-medium text-gray-900 mt-4 mb-2">{line.slice(4)}</h3>;
            }
            if (line.startsWith('- ')) {
              return <li key={i} className="text-gray-700 ml-4">{renderInlineStyles(line.slice(2))}</li>;
            }
            if (line.trim() === '') {
              return <div key={i} className="h-2"></div>;
            }
            return <p key={i} className="text-gray-700 my-2">{renderInlineStyles(line)}</p>;
          })}
        </div>
      );
    }

    if (block.type === 'chart' && block.widget) {
      return (
        <div key={index} className="my-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {block.widget.title && (
              <h4 className="text-sm font-medium text-gray-700 mb-3">{block.widget.title}</h4>
            )}
            <InlineWidget
              portfolioId={portfolioId}
              widget={block.widget}
              compact={false}
            />
          </div>
        </div>
      );
    }

    return null;
  };

  const renderInlineStyles = (text: string) => {
    // Handle **bold** and basic inline formatting
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{report.title}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="capitalize">{report.scope} report</span>
              <span>•</span>
              <span>{getTimeRangeLabel(report.time_range)}</span>
              <span>•</span>
              <span>Generated {formatDate(report.generated_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onExport && (
              <div className="relative group">
                <button className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Export
                </button>
                <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <button
                    onClick={() => onExport('pdf')}
                    className="block w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => onExport('html')}
                    className="block w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
                  >
                    HTML
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={handlePrint}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Print
            </button>
            {onShare && (
              <button
                onClick={onShare}
                className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Share
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {report.content_blocks.map((block, index) => renderContent(block, index))}
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}

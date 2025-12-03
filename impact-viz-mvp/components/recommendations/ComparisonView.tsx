'use client';

import { useState } from 'react';
import { CharityRatingsData } from '@/lib/services/charity-ratings';

type Recommendation = {
  id: string;
  organization_name: string;
  website: string | null;
  sector: string | null;
  ein: string | null;
  location: string | null;
  description: string | null;
  impact_focus: string[] | null;
  accreditation?: {
    ratings?: CharityRatingsData;
  };
  contact_info?: {
    email?: string;
    phone?: string;
    contact_name?: string;
  };
  min_investment?: number | null;
  max_investment?: number | null;
  recommended_at: string;
  interaction_status?: string;
};

type Props = {
  recommendations: Recommendation[];
  onClose: () => void;
  onExport?: (format: 'csv' | 'pdf') => void;
};

export default function ComparisonView({ recommendations, onClose, onExport }: Props) {
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');

  // Add print styles to document
  if (typeof document !== 'undefined') {
    const printStyles = `
      @media print {
        @page { margin: 0.5in; }
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .no-print { display: none !important; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        thead { display: table-header-group; }
      }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.textContent = printStyles;
    document.head.appendChild(styleSheet);
  }

  const handleExport = () => {
    if (exportFormat === 'csv') {
      exportToCSV(recommendations);
    } else {
      exportToPDF(recommendations);
    }
    onExport?.(exportFormat);
  };

  // Get all unique impact focus areas across all recommendations
  const allImpactFocusAreas = Array.from(
    new Set(
      recommendations.flatMap(r => r.impact_focus || [])
    )
  ).sort();

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 shadow-sm z-10 no-print">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900">
              Compare Organizations
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Comparing {recommendations.length} organizations side-by-side
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Export Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'csv' | 'pdf')}
                className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-azure focus:border-azure"
              >
                <option value="csv">Export as CSV</option>
                <option value="pdf">Export as PDF</option>
              </select>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-azure text-white rounded-lg text-sm font-medium hover:bg-azure/90 transition-colors"
              >
                Export
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              title="Close comparison"
            >
              <svg className="w-6 h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-50">
                <th className="sticky left-0 bg-neutral-50 px-4 py-3 text-left text-sm font-semibold text-neutral-700 border-b-2 border-neutral-200 min-w-[200px]">
                  Criteria
                </th>
                {recommendations.map((rec) => (
                  <th
                    key={rec.id}
                    className="px-4 py-3 text-left text-sm font-semibold text-neutral-900 border-b-2 border-neutral-200 min-w-[250px]"
                  >
                    {rec.organization_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Basic Information */}
              <ComparisonSection title="Basic Information">
                <ComparisonRow
                  label="Organization Name"
                  values={recommendations.map(r => r.organization_name)}
                />
                <ComparisonRow
                  label="EIN"
                  values={recommendations.map(r => r.ein || 'N/A')}
                />
                <ComparisonRow
                  label="Sector"
                  values={recommendations.map(r => r.sector || 'N/A')}
                />
                <ComparisonRow
                  label="Location"
                  values={recommendations.map(r => r.location || 'N/A')}
                />
                <ComparisonRow
                  label="Website"
                  values={recommendations.map(r =>
                    r.website ? (
                      <a
                        href={r.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-azure hover:underline text-sm"
                      >
                        Visit Website →
                      </a>
                    ) : (
                      'N/A'
                    )
                  )}
                />
              </ComparisonSection>

              {/* Charity Ratings */}
              <ComparisonSection title="Charity Ratings & Financial Health">
                <ComparisonRow
                  label="Overall Health Score"
                  values={recommendations.map(r => {
                    const score = r.accreditation?.ratings?.summary?.overallHealthScore;
                    return score ? (
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-emerald-600">{score}</span>
                        <span className="text-sm text-neutral-500">/ 100</span>
                      </div>
                    ) : (
                      'Not rated'
                    );
                  })}
                />
                <ComparisonRow
                  label="Financial Health Grade"
                  values={recommendations.map(r => {
                    const grade = r.accreditation?.ratings?.summary?.financialHealthGrade;
                    return grade ? (
                      <span className={`text-lg font-bold ${getGradeColor(grade)}`}>
                        {grade}
                      </span>
                    ) : (
                      'N/A'
                    );
                  })}
                />
                <ComparisonRow
                  label="Transparency Level"
                  values={recommendations.map(r => {
                    const level = r.accreditation?.ratings?.summary?.transparencyLevel;
                    return level ? (
                      <span className="capitalize text-sm">{level}</span>
                    ) : (
                      'N/A'
                    );
                  })}
                />
                <ComparisonRow
                  label="Program Expense Ratio"
                  values={recommendations.map(r => {
                    const ratio = r.accreditation?.ratings?.summary?.programExpenseRatio;
                    return ratio ? `${Math.round(ratio)}%` : 'N/A';
                  })}
                />
                <ComparisonRow
                  label="GuideStar Seal"
                  values={recommendations.map(r => {
                    const seal = r.accreditation?.ratings?.candid?.sealLevel;
                    return seal && seal !== 'none' ? (
                      <span className={`capitalize text-sm font-medium ${getSealColor(seal)}`}>
                        {seal}
                      </span>
                    ) : (
                      'None'
                    );
                  })}
                />
                <ComparisonRow
                  label="Charity Navigator Rating"
                  values={recommendations.map(r => {
                    const rating = r.accreditation?.ratings?.charityNavigator?.overallScore;
                    return rating ? `${rating}/100` : 'N/A';
                  })}
                />
              </ComparisonSection>

              {/* Investment Range */}
              <ComparisonSection title="Suggested Investment">
                <ComparisonRow
                  label="Minimum"
                  values={recommendations.map(r =>
                    r.min_investment ? formatCurrency(r.min_investment) : 'Not specified'
                  )}
                />
                <ComparisonRow
                  label="Maximum"
                  values={recommendations.map(r =>
                    r.max_investment ? formatCurrency(r.max_investment) : 'Not specified'
                  )}
                />
                <ComparisonRow
                  label="Range"
                  values={recommendations.map(r => {
                    if (r.min_investment && r.max_investment) {
                      return `${formatCurrency(r.min_investment)} - ${formatCurrency(r.max_investment)}`;
                    } else if (r.min_investment) {
                      return `${formatCurrency(r.min_investment)}+`;
                    } else if (r.max_investment) {
                      return `Up to ${formatCurrency(r.max_investment)}`;
                    }
                    return 'Flexible';
                  })}
                />
              </ComparisonSection>

              {/* Impact Focus */}
              <ComparisonSection title="Impact Focus Areas">
                {allImpactFocusAreas.map((area) => (
                  <ComparisonRow
                    key={area}
                    label={area}
                    values={recommendations.map(r => {
                      const hasArea = r.impact_focus?.includes(area);
                      return hasArea ? (
                        <span className="text-emerald-600 font-medium">✓ Yes</span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      );
                    })}
                  />
                ))}
              </ComparisonSection>

              {/* Description */}
              <ComparisonSection title="Mission & Description">
                <ComparisonRow
                  label="Description"
                  values={recommendations.map(r =>
                    r.description ? (
                      <p className="text-sm text-neutral-700 leading-relaxed max-w-md">
                        {r.description}
                      </p>
                    ) : (
                      'No description available'
                    )
                  )}
                />
              </ComparisonSection>

              {/* Contact Information */}
              <ComparisonSection title="Contact Information">
                <ComparisonRow
                  label="Contact Name"
                  values={recommendations.map(r =>
                    r.contact_info?.contact_name || 'N/A'
                  )}
                />
                <ComparisonRow
                  label="Email"
                  values={recommendations.map(r =>
                    r.contact_info?.email ? (
                      <a
                        href={`mailto:${r.contact_info.email}`}
                        className="text-azure hover:underline text-sm"
                      >
                        {r.contact_info.email}
                      </a>
                    ) : (
                      'N/A'
                    )
                  )}
                />
                <ComparisonRow
                  label="Phone"
                  values={recommendations.map(r =>
                    r.contact_info?.phone || 'N/A'
                  )}
                />
              </ComparisonSection>

              {/* Status */}
              <ComparisonSection title="Recommendation Status">
                <ComparisonRow
                  label="Current Status"
                  values={recommendations.map(r => (
                    <span className="capitalize text-sm font-medium">
                      {r.interaction_status || 'new'}
                    </span>
                  ))}
                />
                <ComparisonRow
                  label="Recommended On"
                  values={recommendations.map(r =>
                    new Date(r.recommended_at).toLocaleDateString()
                  )}
                />
              </ComparisonSection>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function ComparisonSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-azure/5 border-t-2 border-neutral-300">
        <td
          colSpan={100}
          className="sticky left-0 px-4 py-3 text-sm font-semibold text-azure uppercase tracking-wide"
        >
          {title}
        </td>
      </tr>
      {children}
    </>
  );
}

function ComparisonRow({
  label,
  values,
}: {
  label: string;
  values: (string | number | React.ReactNode)[];
}) {
  return (
    <tr className="border-b border-neutral-100 hover:bg-neutral-50/50">
      <td className="sticky left-0 bg-white hover:bg-neutral-50/50 px-4 py-3 text-sm font-medium text-neutral-700">
        {label}
      </td>
      {values.map((value, idx) => (
        <td key={idx} className="px-4 py-3 text-sm text-neutral-900">
          {value}
        </td>
      ))}
    </tr>
  );
}

// Helper Functions
function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A':
      return 'text-emerald-600';
    case 'B':
      return 'text-green-600';
    case 'C':
      return 'text-yellow-600';
    case 'D':
      return 'text-orange-600';
    case 'F':
      return 'text-red-600';
    default:
      return 'text-neutral-600';
  }
}

function getSealColor(seal: string): string {
  switch (seal) {
    case 'platinum':
      return 'text-purple-600';
    case 'gold':
      return 'text-yellow-600';
    case 'silver':
      return 'text-neutral-500';
    case 'bronze':
      return 'text-orange-600';
    default:
      return 'text-neutral-600';
  }
}

// Export Functions
function exportToCSV(recommendations: Recommendation[]) {
  const headers = [
    'Organization Name',
    'EIN',
    'Sector',
    'Location',
    'Website',
    'Health Score',
    'Financial Grade',
    'Transparency',
    'Program Expense %',
    'GuideStar Seal',
    'CN Rating',
    'Min Investment',
    'Max Investment',
    'Impact Focus',
    'Description',
    'Contact Name',
    'Email',
    'Phone',
    'Status',
    'Recommended On',
  ];

  const rows = recommendations.map(r => [
    r.organization_name,
    r.ein || '',
    r.sector || '',
    r.location || '',
    r.website || '',
    r.accreditation?.ratings?.summary?.overallHealthScore || '',
    r.accreditation?.ratings?.summary?.financialHealthGrade || '',
    r.accreditation?.ratings?.summary?.transparencyLevel || '',
    r.accreditation?.ratings?.summary?.programExpenseRatio || '',
    r.accreditation?.ratings?.candid?.sealLevel || '',
    r.accreditation?.ratings?.charityNavigator?.overallScore || '',
    r.min_investment || '',
    r.max_investment || '',
    r.impact_focus?.join('; ') || '',
    r.description || '',
    r.contact_info?.contact_name || '',
    r.contact_info?.email || '',
    r.contact_info?.phone || '',
    r.interaction_status || 'new',
    new Date(r.recommended_at).toLocaleDateString(),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      row.map(cell =>
        typeof cell === 'string' && cell.includes(',')
          ? `"${cell.replace(/"/g, '""')}"`
          : cell
      ).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `recommendations-comparison-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

function exportToPDF(recommendations: Recommendation[]) {
  // For PDF export, we'll use print-friendly styling
  // The user can use their browser's Print to PDF function
  window.print();
}

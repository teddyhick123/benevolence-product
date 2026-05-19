'use client';

import * as React from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import AISummaryCard from '@/components/AISummaryCard';

export default function SummarySection({ portfolioId }: { portfolioId: string }) {
  return (
    <section className="w-full min-w-0 space-y-4">
      <SectionHeader
        title="Summary"
        subtitle="AI-generated portfolio overview"
        /* No edit controls here; the card manages its own fetch */
      />

      <div className="w-full">
        <AISummaryCard portfolioId={portfolioId} />
      </div>
    </section>
  );
}

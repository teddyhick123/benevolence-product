import type { PortfolioAccessContext } from '@/lib/api/principals';
import type { Json } from '@/lib/database.types';

export type LetterContent = {
  letter_content: string;
  summary_data: {
    portfolio: unknown;
    summary: unknown;
    kpis: unknown[];
    holdings: unknown[];
  };
};

function parseLetterContent(value: Json | null): LetterContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const letter = value as Record<string, unknown>;
  const summary = letter.summary_data;
  if (typeof letter.letter_content !== 'string' || !summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return null;
  }
  const data = summary as Record<string, unknown>;
  return {
    letter_content: letter.letter_content,
    summary_data: {
      portfolio: data.portfolio,
      summary: data.summary,
      kpis: Array.isArray(data.kpis) ? data.kpis : [],
      holdings: Array.isArray(data.holdings) ? data.holdings : [],
    },
  };
}

/** Generated-document operations constrained to one authorized portfolio. */
export function createGeneratedDocumentsRepository(scope: PortfolioAccessContext) {
  const db = scope.db;
  const portfolioId = scope.portfolioId;

  async function latestLetter() {
    const { data, error } = await db
      .from('generated_documents')
      .select('id, content, generated_at, version')
      .eq('portfolio_id', portfolioId)
      .eq('document_type', 'letter')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const content = parseLetterContent(data.content);
    return content ? { ...data, ...content } : null;
  }

  return {
    latestLetter,

    async saveLetter(letter: LetterContent) {
      const latest = await latestLetter();
      const version = (latest?.version ?? 0) + 1;
      const { data, error } = await db
        .from('generated_documents')
        .insert({
          portfolio_id: portfolioId,
          generated_by: scope.user.id,
          title: `Portfolio letter v${version}`,
          document_type: 'letter',
          format: 'html',
          scope: 'portfolio',
          content: letter as unknown as Json,
          version,
        })
        .select('id, generated_at, version')
        .single();
      if (error) throw error;
      return data;
    },
  };
}

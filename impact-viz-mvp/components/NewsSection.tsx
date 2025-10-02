'use client';

import * as React from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

type NewsArticle = {
  id: string;
  holding_id: string;
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  summary: string | null;
  image_url: string | null;
  sentiment: string | null;
  created_at: string;
};

export default function NewsSection({ holdingId }: { holdingId: string }) {
  const { data, error, isLoading } = useSWR<{ data: NewsArticle[] }>(
    `/api/holdings/${encodeURIComponent(holdingId)}/news`,
    fetcher
  );

  const articles = data?.data ?? [];

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-medium text-neutral-700 mb-4">Recent News</h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-neutral-100 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
        <h3 className="text-sm font-medium text-red-700 mb-2">Recent News</h3>
        <p className="text-xs text-red-600">Failed to load news articles</p>
      </section>
    );
  }

  if (articles.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 shadow-sm">
        <h3 className="text-sm font-medium text-neutral-700 mb-2">Recent News</h3>
        <p className="text-xs text-neutral-500">No recent news articles found for this holding.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-medium text-neutral-700 mb-4">Recent News</h3>

      <div className="space-y-4">
        {articles.map(article => (
          <NewsArticleCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}

function NewsArticleCard({ article }: { article: NewsArticle }) {
  const publishedDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : null;

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group hover:bg-neutral-50 rounded-lg p-3 -mx-3 transition-colors"
    >
      <div className="flex gap-3">
        {/* Optional thumbnail */}
        {article.image_url && (
          <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-neutral-100">
            <img
              src={article.image_url}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                // Hide image if it fails to load
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-neutral-900 group-hover:text-azure line-clamp-2 mb-1">
            {article.title}
          </h4>

          {article.summary && (
            <p className="text-xs text-neutral-600 line-clamp-2 mb-2">
              {article.summary}
            </p>
          )}

          <div className="flex items-center gap-2 text-xs text-neutral-500">
            {article.source && <span className="font-medium">{article.source}</span>}
            {article.source && publishedDate && <span>•</span>}
            {publishedDate && <span>{publishedDate}</span>}
            {article.sentiment && (
              <>
                <span>•</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  article.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                  article.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                  'bg-neutral-100 text-neutral-700'
                }`}>
                  {article.sentiment}
                </span>
              </>
            )}
          </div>
        </div>

        {/* External link icon */}
        <div className="flex-shrink-0">
          <svg
            className="w-4 h-4 text-neutral-400 group-hover:text-azure transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </div>
      </div>
    </a>
  );
}

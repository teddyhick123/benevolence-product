'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import RecommendationsView from '@/components/recommendations/RecommendationsView';
import RecommendationsManager from '@/components/recommendations/RecommendationsManager';

type Recommendation = {
  id: string;
  organization_name: string;
  website: string | null;
  sector: string | null;
  ein: string | null;
  location: string | null;
  description: string | null;
  impact_focus: string[] | null;
  accreditation: any;
  contact_info: any;
  min_investment: number | null;
  max_investment: number | null;
  recommended_at: string;
};

function RecommendationsPageContent() {
  const searchParams = useSearchParams();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'viewer' | 'editor' | 'owner' | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Get portfolio ID
  useEffect(() => {
    async function loadPortfolioId() {
      // Try URL params first
      const urlPortfolioId = searchParams.get('portfolio_id');
      if (urlPortfolioId) {
        setPortfolioId(urlPortfolioId);
        return;
      }

      // Fall back to /api/me
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        const data = await res.json();
        if (data?.portfolio_id || data?.recommended_portfolio_id) {
          setPortfolioId(data.portfolio_id || data.recommended_portfolio_id);
        } else {
          // No portfolio found - user is not a member of any portfolios
          setPortfolioId(null);
        }
      } catch (err) {
        console.error('Failed to load portfolio ID:', err);
        setPortfolioId(null);
      }
    }
    loadPortfolioId();
  }, [searchParams]);

  // Load recommendations and user role
  useEffect(() => {
    if (!portfolioId) return;

    async function loadData() {
      setLoading(true);
      try {
        // Load recommendations
        const recRes = await fetch(`/api/portfolio/${portfolioId}/recommendations`, {
          cache: 'no-store'
        });
        const recData = await recRes.json();
        if (recRes.ok) {
          setRecommendations(recData.data || []);
        }

        // Check if user is admin
        const adminRes = await fetch('/api/admin/is_admin', { cache: 'no-store' });
        if (adminRes.ok) {
          const adminData = await adminRes.json();
          setIsAdmin(adminData?.is_admin || false);
        }

        // Get user's role for this portfolio
        const roleRes = await fetch(`/api/portfolio/${portfolioId}/member-role`, {
          cache: 'no-store'
        });
        if (roleRes.ok) {
          const roleData = await roleRes.json();
          setUserRole(roleData?.role || 'viewer');
        }
      } catch (err) {
        console.error('Failed to load recommendations:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [portfolioId]);

  const isManager = isAdmin || userRole === 'owner';

  if (loading) {
    return (
      <div className="min-h-screen bg-creme flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-azure/30 border-t-azure rounded-full animate-spin mb-4"></div>
          <p className="text-neutral-800">Loading recommendations...</p>
        </div>
      </div>
    );
  }

  if (!portfolioId) {
    return (
      <div className="min-h-screen bg-creme flex items-center justify-center">
        <div className="card p-8 max-w-md text-center">
          <svg className="w-16 h-16 text-azure/30 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">No Portfolio Found</h2>
          <p className="text-neutral-600 mb-4">
            You are not currently a member of any portfolios. Ask your portfolio manager to add you, or contact an administrator for access.
          </p>
          <div className="flex flex-col gap-2">
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-soft"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Go to Dashboard
            </a>
            <a
              href="/profile"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-neutral-300 text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              View Profile
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-creme">
      {/* Header Navigation */}
      <header className="border-b border-neutral-200 bg-creme/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <a
            href={`/dashboard?portfolio_id=${portfolioId}`}
            className="inline-flex items-center gap-2 text-sm text-neutral-700 hover:text-neutral-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {isManager ? (
          <RecommendationsManager
            portfolioId={portfolioId}
            recommendations={recommendations}
            onUpdate={() => {
              // Reload recommendations
              fetch(`/api/portfolio/${portfolioId}/recommendations`, { cache: 'no-store' })
                .then(res => res.json())
                .then(data => setRecommendations(data.data || []))
                .catch(err => console.error('Failed to reload recommendations:', err));
            }}
          />
        ) : (
          <RecommendationsView recommendations={recommendations} loading={false} />
        )}
      </main>
    </div>
  );
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-creme flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-azure/30 border-t-azure rounded-full animate-spin mb-4"></div>
          <p className="text-neutral-800">Loading recommendations...</p>
        </div>
      </div>
    }>
      <RecommendationsPageContent />
    </Suspense>
  );
}

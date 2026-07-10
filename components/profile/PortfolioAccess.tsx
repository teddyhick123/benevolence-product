'use client';

type Portfolio = {
  role: string;
  added_at: string;
  portfolio: {
    id: string;
    name: string;
    description: string | null;
  };
};

type PortfolioAccessProps = {
  portfolios: Portfolio[];
  isAdmin: boolean;
};

export default function PortfolioAccess({ portfolios, isAdmin }: PortfolioAccessProps) {
  const getRoleBadge = (role: string) => {
    const roleStyles = {
      owner: 'bg-azure/10 text-azure border-azure/20',
      admin: 'bg-violet-50 text-violet-700 border-violet-200',
      member: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      viewer: 'bg-neutral-100 text-neutral-600 border-neutral-200'
    };

    const style = roleStyles[role as keyof typeof roleStyles] || roleStyles.viewer;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="rounded-2xl bg-white shadow-soft border border-black/5 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">Portfolio Access</h2>
        {isAdmin && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 text-white text-xs font-medium">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Admin
          </span>
        )}
      </div>

      {portfolios.length === 0 ? (
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neutral-100 mb-3">
            <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-sm text-neutral-600">You don&apos;t have access to any portfolios yet.</p>
          <p className="text-xs text-neutral-500 mt-1">Contact an administrator to request access.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {portfolios.map((p) => (
            <a
              key={p.portfolio.id}
              href={`/portfolio/${p.portfolio.id}`}
              className="block p-4 rounded-lg border border-neutral-200 hover:border-azure/40 hover:bg-azure/5 transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-neutral-900 group-hover:text-azure transition-colors">
                      {p.portfolio.name}
                    </h3>
                    {getRoleBadge(p.role)}
                  </div>
                  {p.portfolio.description && (
                    <p className="text-sm text-neutral-600 line-clamp-2">
                      {p.portfolio.description}
                    </p>
                  )}
                  <p className="text-xs text-neutral-500 mt-1.5">
                    Added {formatDate(p.added_at)}
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-neutral-400 group-hover:text-azure transition-colors flex-shrink-0 mt-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

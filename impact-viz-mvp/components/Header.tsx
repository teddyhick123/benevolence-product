"use client";
import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function HeaderContent() {
  const [user, setUser] = useState<any>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgModules, setOrgModules] = useState<Record<string, boolean>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null)).catch(() => {});
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch user's portfolio ID from API
  useEffect(() => {
    async function fetchPortfolio() {
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data?.portfolio_id) {
            setPortfolioId(data.portfolio_id);
          }
        }
      } catch {
        // Failed to fetch portfolio
      }
    }

    if (user) {
      fetchPortfolio();
    }
  }, [user]);

  // Fetch org info for name display and conditional nav links
  useEffect(() => {
    async function fetchOrg() {
      try {
        const res = await fetch('/api/org', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const firstOrg = data?.organizations?.[0];
          if (firstOrg?.modules) {
            setOrgModules(firstOrg.modules);
          }
          if (firstOrg?.name) {
            setOrgName(firstOrg.name);
          }
        }
      } catch {
        // ignore
      }
    }

    if (user) {
      fetchOrg();
    }
  }, [user]);

  // Get current portfolio ID: URL param > fetched from user > default
  const urlPortfolioId = searchParams.get('portfolio_id');
  const currentPortfolioId = urlPortfolioId || portfolioId || process.env.NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT || '';

  const dashboardHref = currentPortfolioId ? `/dashboard?portfolio_id=${encodeURIComponent(currentPortfolioId)}` : '/dashboard';
  const charitiesHref = '/charities';
  const taxHref = currentPortfolioId ? `/dashboard/tax?portfolio_id=${encodeURIComponent(currentPortfolioId)}` : '/dashboard/tax';

  async function handleSignOut() {
    await supabase.auth.signOut();
    setMobileMenuOpen(false);
    window.location.href = "/";
  }

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const navLinkClass = "font-sans text-sm px-4 py-2 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none";
  const mobileNavLinkClass = "block w-full text-left font-sans text-sm px-4 py-3 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-colors";

  return (
    <header className="w-full sticky top-0 z-40 bg-creme/90 backdrop-blur-md border-b border-black/5">
      <div className="w-full px-4 md:px-6 lg:px-8 py-2 md:py-3 flex items-center justify-between">
        {/* Left: brand (B.) + org name */}
        <Link href="/" className="inline-flex items-center gap-2 group transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none">
          <span className="font-serif text-2xl leading-none text-azure group-hover:opacity-90">B.</span>
          {orgName && (
            <span className="hidden sm:block font-sans text-xs text-black/40 leading-none">{orgName}</span>
          )}
        </Link>

        {/* Right: auth-aware nav */}
        {!user ? (
          <Link
            href="/login"
            className="font-sans text-sm px-4 py-2 rounded-md bg-azure text-white shadow-soft hover:opacity-90 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
          >
            Sign in
          </Link>
        ) : (
          <>
            {/* Desktop Navigation (hidden on mobile) */}
            <nav className="hidden md:flex items-center gap-2">
              {/* Portfolio group */}
              <Link
                href={dashboardHref}
                aria-current={pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/tax') && !pathname.startsWith('/dashboard/donors') && !pathname.startsWith('/dashboard/compliance') && !pathname.startsWith('/dashboard/settings') ? 'page' : undefined}
                className={navLinkClass}
              >
                Dashboard
              </Link>
              <Link
                href={charitiesHref}
                aria-current={pathname.startsWith('/charities') ? 'page' : undefined}
                className={navLinkClass}
              >
                Charities
              </Link>

              {/* Operations group */}
              <Link
                href={taxHref}
                aria-current={pathname.startsWith('/dashboard/tax') ? 'page' : undefined}
                className={navLinkClass}
              >
                Tax
              </Link>
              {orgModules.donors && (
                <Link
                  href="/dashboard/donors"
                  aria-current={pathname.startsWith('/dashboard/donors') ? 'page' : undefined}
                  className={navLinkClass}
                >
                  Donors
                </Link>
              )}
              {orgModules.compliance && (
                <Link
                  href="/dashboard/compliance"
                  aria-current={pathname.startsWith('/dashboard/compliance') ? 'page' : undefined}
                  className={navLinkClass}
                >
                  Compliance
                </Link>
              )}

              {/* Integrations */}
              <Link
                href="/dashboard/settings/integrations"
                aria-current={pathname.startsWith('/dashboard/settings/integrations') ? 'page' : undefined}
                className={navLinkClass}
              >
                Integrations
              </Link>
              <Link
                href="/settings"
                aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
                className={navLinkClass}
              >
                Settings
              </Link>

              <Link
                href="/profile"
                aria-current={pathname === '/profile' ? 'page' : undefined}
                className={navLinkClass}
              >
                Profile
              </Link>
              <button
                onClick={handleSignOut}
                className={navLinkClass}
              >
                Sign out
              </button>
            </nav>

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md hover:bg-black/5 transition-colors"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </>
        )}
      </div>

      {/* Mobile Menu Drawer */}
      {user && mobileMenuOpen && (
        <div className="md:hidden border-t border-black/5 bg-creme/95 backdrop-blur-md">
          {orgName && (
            <div className="px-6 pt-3 pb-1 text-xs text-black/40">{orgName}</div>
          )}
          <nav className="px-4 py-3 space-y-2">
            <Link
              href={dashboardHref}
              aria-current={pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/tax') && !pathname.startsWith('/dashboard/donors') && !pathname.startsWith('/dashboard/compliance') && !pathname.startsWith('/dashboard/settings') ? 'page' : undefined}
              className={mobileNavLinkClass}
            >
              Dashboard
            </Link>
            <Link
              href={charitiesHref}
              aria-current={pathname.startsWith('/charities') ? 'page' : undefined}
              className={mobileNavLinkClass}
            >
              Charities
            </Link>
            <Link
              href={taxHref}
              aria-current={pathname.startsWith('/dashboard/tax') ? 'page' : undefined}
              className={mobileNavLinkClass}
            >
              Tax
            </Link>
            {orgModules.donors && (
              <Link
                href="/dashboard/donors"
                aria-current={pathname.startsWith('/dashboard/donors') ? 'page' : undefined}
                className={mobileNavLinkClass}
              >
                Donors
              </Link>
            )}
            {orgModules.compliance && (
              <Link
                href="/dashboard/compliance"
                aria-current={pathname.startsWith('/dashboard/compliance') ? 'page' : undefined}
                className={mobileNavLinkClass}
              >
                Compliance
              </Link>
            )}
            <Link
              href="/dashboard/settings/integrations"
              aria-current={pathname.startsWith('/dashboard/settings/integrations') ? 'page' : undefined}
              className={mobileNavLinkClass}
            >
              Integrations
            </Link>
            <Link
              href="/settings"
              aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
              className={mobileNavLinkClass}
            >
              Settings
            </Link>
            <Link
              href="/profile"
              aria-current={pathname === '/profile' ? 'page' : undefined}
              className={mobileNavLinkClass}
            >
              Profile
            </Link>
            <button
              onClick={handleSignOut}
              className={mobileNavLinkClass}
            >
              Sign out
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}

export default function Header() {
  return (
    <Suspense fallback={
      <header className="w-full sticky top-0 z-40 bg-creme/90 backdrop-blur-md border-b border-black/5">
        <div className="w-full px-4 md:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 group transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none">
            <span className="font-serif text-2xl leading-none text-azure group-hover:opacity-90">B.</span>
          </Link>
        </div>
      </header>
    }>
      <HeaderContent />
    </Suspense>
  );
}

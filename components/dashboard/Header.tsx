"use client";

import { apiRequest, readJson } from "@/lib/api/client";
import Link from "next/link";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { pickActiveOrg, setActiveOrgId } from "@/lib/organizations/active-org";
import NotificationBell from "@/components/notifications/NotificationBell";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function HeaderContent() {
  const [user, setUser] = useState<any>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgModules, setOrgModules] = useState<Record<string, boolean>>({});
  const [allOrgs, setAllOrgs] = useState<Array<{ id: string; name: string; role?: string }>>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [activeOrgRole, setActiveOrgRole] = useState<string | null>(null);
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const orgSwitcherRef = useRef<HTMLDivElement>(null);
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
        const res = await apiRequest('/api/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await readJson(res);
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
        const res = await apiRequest('/api/org', { cache: 'no-store' });
        if (res.ok) {
          const data = await readJson(res);
          const orgs: Array<{ id: string; name: string; role?: string; modules?: Record<string, boolean> }> = data?.organizations ?? [];
          setAllOrgs(orgs);
          const activeOrg = pickActiveOrg(orgs);
          if (activeOrg?.modules) setOrgModules(activeOrg.modules);
          if (activeOrg?.name) setOrgName(activeOrg.name);
          if (activeOrg?.id) setActiveOrgIdState(activeOrg.id);
          setActiveOrgRole(activeOrg?.role ?? null);
        }
      } catch {
        // ignore
      }
    }

    if (user) {
      fetchOrg();
    }
  }, [user]);

  // Outside-click dismiss for org switcher
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (orgSwitcherRef.current && !orgSwitcherRef.current.contains(e.target as Node)) {
        setOrgSwitcherOpen(false);
      }
    }
    if (orgSwitcherOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [orgSwitcherOpen]);

  function switchOrg(orgId: string) {
    setActiveOrgId(orgId);
    setOrgSwitcherOpen(false);
    window.location.reload();
  }

  // Get current portfolio ID: URL param > fetched from user > default
  const urlPortfolioId = searchParams.get('portfolio_id');
  const currentPortfolioId = urlPortfolioId || portfolioId || process.env.NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT || '';

  const dashboardHref = currentPortfolioId ? `/dashboard?portfolio_id=${encodeURIComponent(currentPortfolioId)}` : '/dashboard';
  const charitiesHref = '/charities';
  const taxHref = currentPortfolioId ? `/dashboard/tax?portfolio_id=${encodeURIComponent(currentPortfolioId)}` : '/dashboard/tax';
  const canAccessBuilderStudio = activeOrgRole === 'admin' || activeOrgRole === 'owner';

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
        {/* Left: brand (B.) + org name / switcher */}
        <div className="flex items-center gap-2">
          <Link href="/" className="inline-flex items-center gap-2 group transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none">
            <span className="font-serif text-2xl leading-none text-azure group-hover:opacity-90">B.</span>
          </Link>
          {orgName && (
            allOrgs.length > 1 ? (
              <div ref={orgSwitcherRef} className="relative hidden sm:block">
                <button
                  onClick={() => setOrgSwitcherOpen(v => !v)}
                  className="flex items-center gap-1 font-sans text-xs text-black/50 hover:text-black/70 transition-colors"
                >
                  <span>{orgName}</span>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {orgSwitcherOpen && (
                  <div className="absolute top-full left-0 mt-1 min-w-[160px] bg-white border border-black/10 rounded-lg shadow-soft z-50 py-1">
                    {allOrgs.map(org => (
                      <button
                        key={org.id}
                        onClick={() => switchOrg(org.id)}
                        className="block w-full text-left px-3 py-2 text-xs hover:bg-black/5 text-neutral-700"
                      >
                        {org.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="hidden sm:block font-sans text-xs text-black/40 leading-none">{orgName}</span>
            )
          )}
        </div>

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
                aria-current={pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/tax') && !pathname.startsWith('/dashboard/donors') && !pathname.startsWith('/dashboard/pledges') && !pathname.startsWith('/dashboard/compliance') && !pathname.startsWith('/dashboard/settings') ? 'page' : undefined}
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
              {orgModules.tax && (
                <Link
                  href={taxHref}
                  aria-current={pathname.startsWith('/dashboard/tax') ? 'page' : undefined}
                  className={navLinkClass}
                >
                  Tax
                </Link>
              )}
              {orgModules.donors && (
                <Link
                  href="/dashboard/donors"
                  aria-current={pathname.startsWith('/dashboard/donors') ? 'page' : undefined}
                  className={navLinkClass}
                >
                  Donors
                </Link>
              )}
              {orgModules.donors && orgModules.pledges && (
                <Link
                  href="/dashboard/pledges"
                  aria-current={pathname.startsWith('/dashboard/pledges') ? 'page' : undefined}
                  className={navLinkClass}
                >
                  Pledges
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
                href="/settings/integrations"
                aria-current={pathname.startsWith('/settings/integrations') ? 'page' : undefined}
                className={navLinkClass}
              >
                Integrations
              </Link>
              <Link
                href="/settings/ai"
                aria-current={pathname.startsWith('/settings/ai') ? 'page' : undefined}
                className={navLinkClass}
              >
                AI Models
              </Link>
              {canAccessBuilderStudio && (
                <Link
                  href="/builder-studio"
                  aria-current={pathname.startsWith('/builder-studio') ? 'page' : undefined}
                  className={navLinkClass}
                >
                  Builder Studio
                </Link>
              )}
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

            {/* Notification Bell */}
            {activeOrgId && <NotificationBell orgId={activeOrgId} />}

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
              aria-current={pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/tax') && !pathname.startsWith('/dashboard/donors') && !pathname.startsWith('/dashboard/pledges') && !pathname.startsWith('/dashboard/compliance') && !pathname.startsWith('/dashboard/settings') ? 'page' : undefined}
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
            {orgModules.tax && (
              <Link
                href={taxHref}
                aria-current={pathname.startsWith('/dashboard/tax') ? 'page' : undefined}
                className={mobileNavLinkClass}
              >
                Tax
              </Link>
            )}
            {orgModules.donors && (
              <Link
                href="/dashboard/donors"
                aria-current={pathname.startsWith('/dashboard/donors') ? 'page' : undefined}
                className={mobileNavLinkClass}
              >
                Donors
              </Link>
            )}
            {orgModules.donors && orgModules.pledges && (
              <Link
                href="/dashboard/pledges"
                aria-current={pathname.startsWith('/dashboard/pledges') ? 'page' : undefined}
                className={mobileNavLinkClass}
              >
                Pledges
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
              href="/settings/integrations"
              aria-current={pathname.startsWith('/settings/integrations') ? 'page' : undefined}
              className={mobileNavLinkClass}
            >
              Integrations
            </Link>
            <Link
              href="/settings/ai"
              aria-current={pathname.startsWith('/settings/ai') ? 'page' : undefined}
              className={mobileNavLinkClass}
            >
              AI Models
            </Link>
            {canAccessBuilderStudio && (
              <Link
                href="/builder-studio"
                aria-current={pathname.startsWith('/builder-studio') ? 'page' : undefined}
                className={mobileNavLinkClass}
              >
                Builder Studio
              </Link>
            )}
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

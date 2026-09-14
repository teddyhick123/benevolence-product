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
  const [secondaryMenuOpen, setSecondaryMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const orgSwitcherRef = useRef<HTMLDivElement>(null);
  const secondaryMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
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

  // Dismiss desktop menus when focus moves away from the header controls.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (orgSwitcherRef.current && !orgSwitcherRef.current.contains(e.target as Node)) {
        setOrgSwitcherOpen(false);
      }
      if (secondaryMenuRef.current && !secondaryMenuRef.current.contains(e.target as Node)) {
        setSecondaryMenuOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOrgSwitcherOpen(false);
        setSecondaryMenuOpen(false);
        setAccountMenuOpen(false);
      }
    }
    if (orgSwitcherOpen || secondaryMenuOpen || accountMenuOpen) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [orgSwitcherOpen, secondaryMenuOpen, accountMenuOpen]);

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
    setSecondaryMenuOpen(false);
    setAccountMenuOpen(false);
  }, [pathname]);

  const isDashboardRoute = pathname.startsWith('/dashboard')
    && !pathname.startsWith('/dashboard/tax')
    && !pathname.startsWith('/dashboard/donors')
    && !pathname.startsWith('/dashboard/pledges')
    && !pathname.startsWith('/dashboard/compliance')
    && !pathname.startsWith('/dashboard/settings');
  const isSecondaryRoute = pathname.startsWith('/settings') || pathname.startsWith('/builder-studio');
  const workspaceLinkClass = (isActive: boolean) => `font-sans text-sm px-3 py-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 ${
    isActive
      ? 'bg-azure text-white shadow-sm'
      : 'text-neutral-600 hover:bg-white hover:text-neutral-900'
  }`;
  const menuTriggerClass = (isActive: boolean) => `inline-flex items-center gap-1 font-sans text-sm px-3 py-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 ${
    isActive
      ? 'bg-azure/10 text-azure'
      : 'text-neutral-600 hover:bg-white hover:text-neutral-900'
  }`;
  const menuItemClass = (isActive: boolean) => `block w-full text-left font-sans text-sm px-3 py-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-azure/50 ${
    isActive
      ? 'bg-azure/10 text-azure font-medium'
      : 'text-neutral-700 hover:bg-black/5'
  }`;
  const mobileNavLinkClass = (isActive: boolean) => `block w-full text-left font-sans text-sm px-4 py-3 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 ${
    isActive
      ? 'bg-azure text-white shadow-sm'
      : 'border border-black/10 bg-white/70 text-neutral-700 hover:bg-white'
  }`;

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
            <div className="hidden lg:flex flex-1 items-center justify-end gap-3">
              <nav aria-label="Workspace" className="flex items-center gap-1">
                <Link href={dashboardHref} aria-current={isDashboardRoute ? 'page' : undefined} className={workspaceLinkClass(isDashboardRoute)}>Dashboard</Link>
                <Link href={charitiesHref} aria-current={pathname.startsWith('/charities') ? 'page' : undefined} className={workspaceLinkClass(pathname.startsWith('/charities'))}>Charities</Link>
                {orgModules.tax && <Link href={taxHref} aria-current={pathname.startsWith('/dashboard/tax') ? 'page' : undefined} className={workspaceLinkClass(pathname.startsWith('/dashboard/tax'))}>Tax</Link>}
                {orgModules.donors && <Link href="/dashboard/donors" aria-current={pathname.startsWith('/dashboard/donors') ? 'page' : undefined} className={workspaceLinkClass(pathname.startsWith('/dashboard/donors'))}>Donors</Link>}
                {orgModules.donors && orgModules.pledges && <Link href="/dashboard/pledges" aria-current={pathname.startsWith('/dashboard/pledges') ? 'page' : undefined} className={workspaceLinkClass(pathname.startsWith('/dashboard/pledges'))}>Pledges</Link>}
                {orgModules.compliance && <Link href="/dashboard/compliance" aria-current={pathname.startsWith('/dashboard/compliance') ? 'page' : undefined} className={workspaceLinkClass(pathname.startsWith('/dashboard/compliance'))}>Compliance</Link>}
              </nav>

              <div ref={secondaryMenuRef} className="relative border-l border-black/10 pl-2">
                <button
                  type="button"
                  onClick={() => { setSecondaryMenuOpen(open => !open); setAccountMenuOpen(false); }}
                  className={menuTriggerClass(isSecondaryRoute)}
                  aria-expanded={secondaryMenuOpen}
                  aria-haspopup="menu"
                >
                  More
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" /></svg>
                </button>
                {secondaryMenuOpen && (
                  <div role="menu" aria-label="Administration and settings" className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-black/10 bg-white p-1 shadow-soft z-50">
                    <Link role="menuitem" href="/settings/integrations" aria-current={pathname.startsWith('/settings/integrations') ? 'page' : undefined} className={menuItemClass(pathname.startsWith('/settings/integrations'))}>Integrations</Link>
                    <Link role="menuitem" href="/settings/ai" aria-current={pathname.startsWith('/settings/ai') ? 'page' : undefined} className={menuItemClass(pathname.startsWith('/settings/ai'))}>AI Models</Link>
                    {canAccessBuilderStudio && <Link role="menuitem" href="/builder-studio" aria-current={pathname.startsWith('/builder-studio') ? 'page' : undefined} className={menuItemClass(pathname.startsWith('/builder-studio'))}>Builder Studio</Link>}
                    <div className="my-1 border-t border-black/5" />
                    <Link role="menuitem" href="/settings" aria-current={pathname === '/settings' ? 'page' : undefined} className={menuItemClass(pathname === '/settings')}>Settings</Link>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 border-l border-black/10 pl-3">
                {activeOrgId && <NotificationBell orgId={activeOrgId} />}
                <div ref={accountMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => { setAccountMenuOpen(open => !open); setSecondaryMenuOpen(false); }}
                    className={menuTriggerClass(pathname === '/profile')}
                    aria-expanded={accountMenuOpen}
                    aria-haspopup="menu"
                  >
                    Account
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" /></svg>
                  </button>
                  {accountMenuOpen && (
                    <div role="menu" aria-label="Account" className="absolute right-0 top-full mt-2 w-40 rounded-lg border border-black/10 bg-white p-1 shadow-soft z-50">
                      <Link role="menuitem" href="/profile" aria-current={pathname === '/profile' ? 'page' : undefined} className={menuItemClass(pathname === '/profile')}>Profile</Link>
                      <div className="my-1 border-t border-black/5" />
                      <button role="menuitem" onClick={handleSignOut} className={`${menuItemClass(false)} text-coral`}>Sign out</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 lg:hidden">
              {activeOrgId && <NotificationBell orgId={activeOrgId} />}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md hover:bg-black/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation"
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
            </div>
          </>
        )}
      </div>

      {/* Mobile navigation keeps the same hierarchy while preserving generous touch targets. */}
      {user && mobileMenuOpen && (
        <div id="mobile-navigation" className="lg:hidden border-t border-black/5 bg-creme/95 backdrop-blur-md">
          {orgName && (
            <div className="px-4 pt-4">
              {allOrgs.length > 1 ? (
                <label className="block">
                  <span className="mb-1 block font-sans text-xs font-medium uppercase tracking-wide text-black/45">Organization</span>
                  <select
                    value={activeOrgId ?? ''}
                    onChange={(event) => switchOrg(event.target.value)}
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-2.5 font-sans text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-azure/50"
                    aria-label="Switch organization"
                  >
                    {allOrgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                  </select>
                </label>
              ) : (
                <div className="font-sans text-xs text-black/45">{orgName}</div>
              )}
            </div>
          )}
          <nav aria-label="Mobile workspace" className="px-4 py-4 space-y-5">
            <section aria-labelledby="mobile-workspace-heading" className="space-y-2">
              <h2 id="mobile-workspace-heading" className="font-sans text-xs font-medium uppercase tracking-wide text-black/45">Workspace</h2>
            <Link
              href={dashboardHref}
              aria-current={isDashboardRoute ? 'page' : undefined}
              className={mobileNavLinkClass(isDashboardRoute)}
            >
              Dashboard
            </Link>
            <Link
              href={charitiesHref}
              aria-current={pathname.startsWith('/charities') ? 'page' : undefined}
              className={mobileNavLinkClass(pathname.startsWith('/charities'))}
            >
              Charities
            </Link>
            {orgModules.tax && (
              <Link
                href={taxHref}
                aria-current={pathname.startsWith('/dashboard/tax') ? 'page' : undefined}
                className={mobileNavLinkClass(pathname.startsWith('/dashboard/tax'))}
              >
                Tax
              </Link>
            )}
            {orgModules.donors && (
              <Link
                href="/dashboard/donors"
                aria-current={pathname.startsWith('/dashboard/donors') ? 'page' : undefined}
                className={mobileNavLinkClass(pathname.startsWith('/dashboard/donors'))}
              >
                Donors
              </Link>
            )}
            {orgModules.donors && orgModules.pledges && (
              <Link
                href="/dashboard/pledges"
                aria-current={pathname.startsWith('/dashboard/pledges') ? 'page' : undefined}
                className={mobileNavLinkClass(pathname.startsWith('/dashboard/pledges'))}
              >
                Pledges
              </Link>
            )}
            {orgModules.compliance && (
              <Link
                href="/dashboard/compliance"
                aria-current={pathname.startsWith('/dashboard/compliance') ? 'page' : undefined}
                className={mobileNavLinkClass(pathname.startsWith('/dashboard/compliance'))}
              >
                Compliance
              </Link>
            )}
            </section>

            <section aria-labelledby="mobile-administration-heading" className="space-y-2">
              <h2 id="mobile-administration-heading" className="font-sans text-xs font-medium uppercase tracking-wide text-black/45">Administration</h2>
            <Link
              href="/settings/integrations"
              aria-current={pathname.startsWith('/settings/integrations') ? 'page' : undefined}
              className={mobileNavLinkClass(pathname.startsWith('/settings/integrations'))}
            >
              Integrations
            </Link>
            <Link
              href="/settings/ai"
              aria-current={pathname.startsWith('/settings/ai') ? 'page' : undefined}
              className={mobileNavLinkClass(pathname.startsWith('/settings/ai'))}
            >
              AI Models
            </Link>
            {canAccessBuilderStudio && (
              <Link
                href="/builder-studio"
                aria-current={pathname.startsWith('/builder-studio') ? 'page' : undefined}
                className={mobileNavLinkClass(pathname.startsWith('/builder-studio'))}
              >
                Builder Studio
              </Link>
            )}
            <Link
              href="/settings"
              aria-current={pathname === '/settings' ? 'page' : undefined}
              className={mobileNavLinkClass(pathname === '/settings')}
            >
              Settings
            </Link>
            </section>

            <section aria-labelledby="mobile-account-heading" className="space-y-2 border-t border-black/5 pt-4">
              <h2 id="mobile-account-heading" className="font-sans text-xs font-medium uppercase tracking-wide text-black/45">Account</h2>
            <Link
              href="/profile"
              aria-current={pathname === '/profile' ? 'page' : undefined}
              className={mobileNavLinkClass(pathname === '/profile')}
            >
              Profile
            </Link>
            <button
              onClick={handleSignOut}
              className={`${mobileNavLinkClass(false)} text-coral`}
            >
              Sign out
            </button>
            </section>
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

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
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
      } catch (error) {
        // Failed to fetch portfolio
      }
    }

    if (user) {
      fetchPortfolio();
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

  return (
    <header className="w-full sticky top-0 z-40 bg-creme/90 backdrop-blur-md border-b border-black/5">
      <div className="w-full px-4 md:px-6 lg:px-8 py-2 md:py-3 flex items-center justify-between">
        {/* Left: brand (B.) */}
        <Link href="/" className="inline-flex items-center gap-2 group transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none">
          <span className="font-serif text-2xl leading-none text-azure group-hover:opacity-90">B.</span>
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
            <nav className="hidden md:flex items-center gap-3">
              <Link
                href={dashboardHref}
                className="font-sans text-sm px-4 py-2 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
              >
                Dashboard
              </Link>
              <Link
                href={charitiesHref}
                className="font-sans text-sm px-4 py-2 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
              >
                Charities
              </Link>
              <Link
                href={taxHref}
                className="font-sans text-sm px-4 py-2 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
              >
                Tax
              </Link>
              <Link
                href="/profile"
                className="font-sans text-sm px-4 py-2 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
              >
                Profile
              </Link>
              <button
                onClick={handleSignOut}
                className="font-sans text-sm px-4 py-2 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
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
                // X icon when menu is open
                <svg className="w-6 h-6 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                // Hamburger icon when menu is closed
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
          <nav className="px-4 py-3 space-y-2">
            <Link
              href={dashboardHref}
              className="block w-full text-left font-sans text-sm px-4 py-3 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href={charitiesHref}
              className="block w-full text-left font-sans text-sm px-4 py-3 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-colors"
            >
              Charities
            </Link>
            <Link
              href={taxHref}
              className="block w-full text-left font-sans text-sm px-4 py-3 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-colors"
            >
              Tax
            </Link>
            <Link
              href="/profile"
              className="block w-full text-left font-sans text-sm px-4 py-3 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-colors"
            >
              Profile
            </Link>
            <button
              onClick={handleSignOut}
              className="block w-full text-left font-sans text-sm px-4 py-3 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-colors"
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
import { branding } from '@/lib/config';

export default function Home() {
  const brandInitial = branding.appName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-creme font-sans antialiased text-ink">

      {/* ── Nav ── */}
      <header className="mx-auto flex max-w-[1120px] items-center justify-between gap-6 px-5 py-6 sm:px-8 lg:px-14 lg:py-8">
        <div className="font-serif text-2xl font-semibold text-azure-deep tracking-tight">
          {branding.appName}<span className="text-coral">.</span>
        </div>
        <nav className="flex items-center gap-3 sm:gap-6 lg:gap-8">
          <a href="#features" className="hidden text-sm text-ink-60 transition-colors hover:text-ink sm:inline">Platform</a>
          <a href="#who" className="hidden text-sm text-ink-60 transition-colors hover:text-ink sm:inline">Who it&apos;s for</a>
          <a
            href="/login"
            className="rounded-2xl border border-azure px-5 py-2.5 text-sm font-medium text-azure transition-colors hover:bg-azure hover:text-white"
          >
            Sign in
          </a>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-[1120px] px-5 pb-16 pt-10 sm:px-8 sm:pt-14 lg:px-14 lg:pb-24 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
          <div>
            <span className="block font-serif italic text-azure text-base tracking-[0.02em] mb-4">
              Capital with conscience, instruments of care.
            </span>
            <h1 className="mb-6 font-serif text-4xl font-medium leading-[1.08] text-azure-deep sm:text-5xl lg:text-[52px]">
              The operating system for{" "}
              <em className="italic text-azure">philanthropic capital.</em>
            </h1>
            <p className="mb-10 max-w-[520px] text-[16px] leading-[1.7] text-ink-60">
              {branding.appName} gives private foundations, family offices, and
              donor-advised funds a modern, unified workspace — impact investments,
              grants, donor relationships, tax obligations, and compliance in one
              place.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/login?signup=1"
                className="inline-flex items-center justify-center rounded-2xl bg-azure px-6 py-3 font-sans text-sm font-medium text-white transition-colors hover:bg-azure-deep"
              >
                Get started →
              </a>
              <a
                href="#features"
                className="inline-flex items-center font-serif italic text-azure text-base font-medium hover:text-azure-deep transition-colors"
              >
                See the platform →
              </a>
            </div>
          </div>

          {/* B. mark */}
          <div className="flex items-center justify-center lg:justify-end">
            <div className="flex h-36 w-36 items-center justify-center rounded-2xl border border-ink-10 bg-white shadow-soft sm:h-44 sm:w-44 lg:h-[220px] lg:w-[220px]">
              <span className="select-none font-serif text-[76px] font-semibold leading-none text-azure-deep sm:text-[96px] lg:text-[120px]">
                {brandInitial}<span className="text-coral">.</span>
              </span>
            </div>
          </div>
        </div>

        {/* Positioning strip */}
        <div className="mt-14 grid border-t border-ink-10 sm:grid-cols-3 lg:mt-16">
          <div className="border-b border-ink-10 py-6 sm:border-b-0 sm:border-r sm:pb-1 sm:pr-7 sm:pt-7">
            <div className="text-[11px] tracking-[0.14em] uppercase text-ink-60 mb-2.5">For</div>
            <div className="font-serif text-[18px] leading-[1.4] text-azure-deep">
              Executive directors, CFOs, and portfolio managers at foundations and family offices.
            </div>
          </div>
          <div className="border-b border-ink-10 py-6 sm:border-b-0 sm:border-r sm:px-7 sm:pb-1 sm:pt-7">
            <div className="text-[11px] tracking-[0.14em] uppercase text-ink-60 mb-2.5">Instead of</div>
            <div className="font-serif text-[18px] leading-[1.4] text-azure-deep">
              Blackbaud RE&nbsp;NXT and the spreadsheet sprawl beside it.
            </div>
          </div>
          <div className="py-6 sm:pb-1 sm:pl-7 sm:pt-7">
            <div className="text-[11px] tracking-[0.14em] uppercase text-ink-60 mb-2.5">So that</div>
            <div className="font-serif text-[18px] leading-[1.4] text-azure-deep">
              Philanthropic impact is as legible as financial return.
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="mx-auto max-w-[1120px] border-t border-ink-10 px-5 py-16 sm:px-8 lg:px-14 lg:py-20">
        <div className="mb-12">
          <div className="text-[11px] tracking-[0.2em] uppercase text-ink-60 mb-2.5">02 · Platform</div>
          <h2 className="font-serif font-medium text-[32px] leading-[1.2] tracking-[-0.015em] text-ink">
            One workspace. Every obligation.
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              eyebrow: "Portfolio",
              title: "Impact & financial returns, side by side.",
              body: "Track equities, PRIs, foundation grants, and crypto in one universal holding model. See unrealized gains, valuation history, and impact KPIs on the same screen.",
            },
            {
              eyebrow: "Tax Center",
              title: "Charitable deductions, Form 8283, QCD.",
              body: "Built for the 2026 OBBB tax regime. Carryforward tracking, AGI optimization, and one-click Form 8283 — for the executive director and their CPA alike.",
            },
            {
              eyebrow: "Compliance",
              title: "990-PF deadlines, never missed.",
              body: "Filing calendar with multi-state registration tracking, automatic reminders, and status workflows. Visible to the whole team, not buried in someone's Outlook.",
            },
            {
              eyebrow: "Grants",
              title: "Full grant lifecycle, board-ready.",
              body: "From diligence to disbursement to grantee reports. Every grant linked to the holdings model so impact data flows directly from your grantees.",
            },
            {
              eyebrow: "Donor CRM",
              title: "The relationship layer your donors deserve.",
              body: "Lifetime giving, recency status, auto-tier logic, and AI-generated acknowledgment letters — with full acknowledgment history and designation tracking.",
            },
            {
              eyebrow: "AI Assistant",
              title: "A portfolio advisor that knows your data.",
              body: "Ask a question in plain English. The AI reads your live holdings, runs analyses, and takes actions — with a full audit trail of everything it touches.",
            },
          ].map(({ eyebrow, title, body }) => (
            <div
              key={eyebrow}
              className="flex flex-col gap-4 rounded-2xl border border-ink-10 bg-white p-6 shadow-soft sm:p-8"
            >
              <div className="text-[11px] tracking-[0.14em] uppercase text-azure font-medium font-sans">
                {eyebrow}
              </div>
              <h3 className="font-serif font-medium text-[20px] leading-[1.3] text-azure-deep">
                {title}
              </h3>
              <p className="text-[14px] leading-[1.7] text-ink-60">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section id="who" className="mx-auto max-w-[1120px] border-t border-ink-10 px-5 py-16 sm:px-8 lg:px-14 lg:py-20">
        <div className="mb-12">
          <div className="text-[11px] tracking-[0.2em] uppercase text-ink-60 mb-2.5">03 · Audience</div>
          <h2 className="font-serif font-medium text-[32px] leading-[1.2] tracking-[-0.015em] text-ink">
            Built for people who are fluent in both capital and conscience.
          </h2>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              label: "Private Foundations",
              desc: "Grantmaking strategy, 990-PF compliance, excise tax management, and impact reporting — for foundations of any size.",
            },
            {
              label: "Family Offices",
              desc: "Investment tracking alongside philanthropic positions. One unified view of the portfolio, including PRIs, MRIs, and DAF grants.",
            },
            {
              label: "Donor-Advised Funds",
              desc: "Sponsor-level administration with per-donor grant recommendations, giving history, and full acknowledgment workflows.",
            },
          ].map(({ label, desc }) => (
            <div key={label} className="border-t-2 border-azure pt-6">
              <div className="font-serif font-medium text-[20px] text-azure-deep mb-3">{label}</div>
              <p className="text-[14px] leading-[1.7] text-ink-60">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Quote / Dark panel ── */}
      <section className="mx-auto max-w-[1120px] px-5 pb-16 sm:px-8 lg:px-14 lg:pb-20">
        <div className="grid items-center gap-10 rounded-2xl bg-azure-deep px-6 py-10 text-creme sm:px-8 lg:grid-cols-[1.3fr_1fr] lg:gap-12 lg:px-12 lg:py-14">
          <div>
            <blockquote className="font-serif font-medium text-[22px] leading-[1.5] text-creme mb-6 italic">
              &ldquo;I can finally see our impact portfolio and our endowment in the
              same window. That used to take three people and a spreadsheet.&rdquo;
            </blockquote>
            <cite className="not-italic text-[11px] tracking-[0.12em] uppercase text-creme/60 font-sans">
              — Executive Director, $1.2B family foundation
            </cite>
            <div className="mt-8">
              <a
                href="/login"
                className="inline-flex items-center rounded-2xl bg-sunset px-6 py-3 font-sans text-sm font-medium text-ink transition-colors hover:bg-[#e89148]"
              >
                Request a demo
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {[
              { k: "AUM tracked", v: "$1.28B", d: "+$42.1M YTD" },
              { k: "Active grants", v: "142", d: "9 program areas" },
              { k: "Time to insight", v: "< 30s", d: "vs. hours in Blackbaud" },
              { k: "Deployments", v: "Per-client", d: "Your data, your instance" },
            ].map(({ k, v, d }) => (
              <div key={k}>
                <div className="text-[10px] tracking-[0.16em] uppercase text-creme/55 mb-1.5 font-sans">{k}</div>
                <div className="font-serif text-[28px] leading-none text-creme tracking-[-0.01em]">{v}</div>
                <div className="text-[11px] text-creme/55 mt-1.5 font-sans tabular-nums">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mx-auto flex max-w-[1120px] flex-col gap-4 border-t border-ink-10 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-14">
        <div className="font-serif font-semibold text-xl text-azure-deep tracking-tight">
          {branding.appName}<span className="text-coral">.</span>
        </div>
        <div className="flex items-center gap-8">
          <a href="/login" className="text-sm text-ink-60 hover:text-ink transition-colors">Sign in</a>
          <span className="text-[12px] text-ink-30 tracking-[0.06em]">© 2026 {branding.appName}</span>
        </div>
      </footer>

    </div>
  );
}

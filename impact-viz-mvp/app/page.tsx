export default function Home() {
  return (
    <div className="min-h-screen bg-creme font-sans antialiased text-ink">

      {/* ── Nav ── */}
      <header className="max-w-[1120px] mx-auto px-14 py-8 flex items-center justify-between">
        <div className="font-serif text-2xl font-semibold text-azure-deep tracking-tight">
          Benevolence<span className="text-coral">.</span>
        </div>
        <nav className="flex items-center gap-8">
          <a href="#features" className="text-sm text-ink-60 hover:text-ink transition-colors">Platform</a>
          <a href="#who" className="text-sm text-ink-60 hover:text-ink transition-colors">Who it's for</a>
          <a
            href="/login"
            className="text-sm font-medium px-5 py-2.5 rounded-[2px] border border-azure text-azure hover:bg-azure hover:text-white transition-colors"
          >
            Sign in
          </a>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-[1120px] mx-auto px-14 pt-16 pb-24">
        <div className="grid grid-cols-[1.5fr_1fr] gap-16 items-center">
          <div>
            <span className="block font-serif italic text-azure text-base tracking-[0.02em] mb-4">
              Capital with conscience, instruments of care.
            </span>
            <h1 className="font-serif font-medium text-[52px] leading-[1.05] tracking-[-0.025em] text-azure-deep mb-6">
              The operating system for{" "}
              <em className="italic text-azure">philanthropic capital.</em>
            </h1>
            <p className="text-[16px] leading-[1.7] text-ink-60 max-w-[460px] mb-10">
              Benevolence gives private foundations, family offices, and
              donor-advised funds a modern, unified workspace — impact investments,
              grants, donor relationships, tax obligations, and compliance in one
              place.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="/login?signup=1"
                className="inline-flex items-center px-6 py-3 rounded-[2px] bg-azure text-white text-sm font-medium font-sans hover:bg-azure-deep transition-colors"
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
          <div className="flex items-center justify-center">
            <div className="w-[220px] h-[220px] bg-white border border-ink-10 rounded-lg flex items-center justify-center shadow-soft">
              <span className="font-serif font-semibold text-[120px] leading-none text-azure-deep select-none">
                B<span className="text-coral">.</span>
              </span>
            </div>
          </div>
        </div>

        {/* Positioning strip */}
        <div className="mt-16 grid grid-cols-3 border-t border-ink-10">
          <div className="pt-7 pr-7 pb-1 border-r border-ink-10">
            <div className="text-[11px] tracking-[0.14em] uppercase text-ink-60 mb-2.5">For</div>
            <div className="font-serif text-[18px] leading-[1.4] text-azure-deep">
              Executive directors, CFOs, and portfolio managers at foundations and family offices.
            </div>
          </div>
          <div className="pt-7 px-7 pb-1 border-r border-ink-10">
            <div className="text-[11px] tracking-[0.14em] uppercase text-ink-60 mb-2.5">Instead of</div>
            <div className="font-serif text-[18px] leading-[1.4] text-azure-deep">
              Blackbaud RE&nbsp;NXT and the spreadsheet sprawl beside it.
            </div>
          </div>
          <div className="pt-7 pl-7 pb-1">
            <div className="text-[11px] tracking-[0.14em] uppercase text-ink-60 mb-2.5">So that</div>
            <div className="font-serif text-[18px] leading-[1.4] text-azure-deep">
              Philanthropic impact is as legible as financial return.
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="max-w-[1120px] mx-auto px-14 py-20 border-t border-ink-10">
        <div className="mb-12">
          <div className="text-[11px] tracking-[0.2em] uppercase text-ink-60 mb-2.5">02 · Platform</div>
          <h2 className="font-serif font-medium text-[32px] leading-[1.2] tracking-[-0.015em] text-ink">
            One workspace. Every obligation.
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-5">
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
              className="bg-white border border-ink-10 rounded-md p-8 flex flex-col gap-4"
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
      <section id="who" className="max-w-[1120px] mx-auto px-14 py-20 border-t border-ink-10">
        <div className="mb-12">
          <div className="text-[11px] tracking-[0.2em] uppercase text-ink-60 mb-2.5">03 · Audience</div>
          <h2 className="font-serif font-medium text-[32px] leading-[1.2] tracking-[-0.015em] text-ink">
            Built for people who are fluent in both capital and conscience.
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-5">
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
      <section className="max-w-[1120px] mx-auto px-14 pb-20">
        <div className="bg-azure-deep text-creme rounded-lg px-12 py-14 grid grid-cols-[1.3fr_1fr] gap-12 items-center">
          <div>
            <blockquote className="font-serif font-medium text-[22px] leading-[1.5] text-creme mb-6 italic">
              "I can finally see our impact portfolio and our endowment in the
              same window. That used to take three people and a spreadsheet."
            </blockquote>
            <cite className="not-italic text-[11px] tracking-[0.12em] uppercase text-creme/60 font-sans">
              — Executive Director, $1.2B family foundation
            </cite>
            <div className="mt-8">
              <a
                href="/login"
                className="inline-flex items-center px-6 py-3 rounded-[2px] bg-sunset text-ink text-sm font-medium font-sans hover:bg-[#e89148] transition-colors"
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
      <footer className="max-w-[1120px] mx-auto px-14 py-8 border-t border-ink-10 flex items-center justify-between">
        <div className="font-serif font-semibold text-xl text-azure-deep tracking-tight">
          Benevolence<span className="text-coral">.</span>
        </div>
        <div className="flex items-center gap-8">
          <a href="/login" className="text-sm text-ink-60 hover:text-ink transition-colors">Sign in</a>
          <span className="text-[12px] text-ink-30 tracking-[0.06em]">© 2026 Benevolence</span>
        </div>
      </footer>

    </div>
  );
}

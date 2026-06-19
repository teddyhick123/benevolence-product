import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ year?: string }>;
};

async function getRequestContext() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  return {
    baseUrl: `${proto}://${host}`,
    forwardedFor: h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '',
    userAgent: h.get('user-agent') ?? '',
  };
}

function money(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function CPAPortalPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  const { baseUrl, forwardedFor, userAgent } = await getRequestContext();
  const query = sp.year ? `?year=${encodeURIComponent(sp.year)}` : '';
  const res = await fetch(`${baseUrl}/api/tax/cpa/${token}${query}`, {
    cache: 'no-store',
    headers: {
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      ...(userAgent ? { 'user-agent': userAgent } : {}),
    },
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    return (
      <main className="min-h-screen bg-creme px-4 py-16 text-ink">
        <div className="mx-auto max-w-xl rounded-lg border border-black/10 bg-white p-8 shadow-soft">
          <h1 className="font-serif text-2xl font-medium">CPA Access Unavailable</h1>
          <p className="mt-3 text-sm text-neutral-600">
            {json.error ?? 'This share link is invalid, expired, revoked, or has reached its access limit.'}
          </p>
        </div>
      </main>
    );
  }

  const data = json.data;
  const selectedYear = data.selected_year;
  const downloadBase = `/api/tax/cpa/${token}/download?year=${selectedYear}`;

  return (
    <main className="min-h-screen bg-creme text-ink">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 border-b border-black/10 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-azure-deep">CPA Tax Portal</p>
              <h1 className="mt-2 font-serif text-3xl font-medium">{data.portfolio.name ?? 'Portfolio'} Tax Data</h1>
              <p className="mt-2 text-sm text-neutral-600">
                Shared with {data.share.cpa_name || 'tax professional'}
                {data.share.cpa_firm ? ` at ${data.share.cpa_firm}` : ''}.
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {data.share.tax_years.map((year: number) => (
                <a
                  key={year}
                  href={`/tax/cpa/${token}?year=${year}`}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    year === selectedYear ? 'bg-azure text-white' : 'border border-black/10 bg-white text-neutral-700'
                  }`}
                >
                  {year}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-xs font-medium uppercase text-neutral-500">Tax Year</p>
            <p className="mt-2 text-2xl font-semibold">{selectedYear}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-xs font-medium uppercase text-neutral-500">Contributions</p>
            <p className="mt-2 text-2xl font-semibold">{data.contributions.length}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-xs font-medium uppercase text-neutral-500">Total Contributed</p>
            <p className="mt-2 text-2xl font-semibold">
              {money(data.summary?.total_contributed ?? data.contributions.reduce((sum: number, c: any) => sum + Number(c.amount_usd ?? 0), 0))}
            </p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-xs font-medium uppercase text-neutral-500">Carryforwards</p>
            <p className="mt-2 text-2xl font-semibold">{data.carryforwards.length}</p>
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-black/10 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-serif text-xl font-medium">Downloads</h2>
            <div className="flex flex-wrap gap-2">
              {data.share.permissions.view_contributions && (
                <a className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-800" href={`${downloadBase}&format=csv`}>
                  CSV
                </a>
              )}
              {data.share.permissions.download_turbotax && (
                <a className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-800" href={`${downloadBase}&format=txf`}>
                  TXF
                </a>
              )}
              {data.share.permissions.download_form8283 && (
                <a className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-800" href={`${downloadBase}&format=form8283`}>
                  Form 8283
                </a>
              )}
            </div>
          </div>
        </section>

        {data.share.permissions.view_contributions && (
          <section className="mb-8 rounded-lg border border-black/10 bg-white">
            <div className="border-b border-black/10 p-5">
              <h2 className="font-serif text-xl font-medium">Contributions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-black/10 text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Property</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {data.contributions.map((c: any) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3">{c.contribution_date}</td>
                      <td className="px-4 py-3">{c.recipient_name}</td>
                      <td className="px-4 py-3">{c.contribution_type}</td>
                      <td className="px-4 py-3 text-right">{money(c.amount_usd)}</td>
                      <td className="px-4 py-3">{c.property_description || ''}</td>
                    </tr>
                  ))}
                  {data.contributions.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-neutral-500" colSpan={5}>No shared contributions for this year.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {data.share.permissions.view_carryforwards && (
          <section className="mb-8 rounded-lg border border-black/10 bg-white p-5">
            <h2 className="font-serif text-xl font-medium">Carryforwards</h2>
            <div className="mt-4 space-y-3">
              {data.carryforwards.map((cf: any) => (
                <div key={cf.id} className="grid gap-2 border-t border-black/10 pt-3 text-sm sm:grid-cols-4">
                  <span>{cf.recipient_name || 'Carryforward'}</span>
                  <span>Originated {cf.originating_tax_year}</span>
                  <span>Expires {cf.expires_tax_year}</span>
                  <span className="sm:text-right">{money(cf.amount_remaining)}</span>
                </div>
              ))}
              {data.carryforwards.length === 0 && <p className="text-sm text-neutral-500">No shared carryforwards.</p>}
            </div>
          </section>
        )}

        {data.share.permissions.view_documents && data.documents.length > 0 && (
          <section className="rounded-lg border border-black/10 bg-white p-5">
            <h2 className="font-serif text-xl font-medium">Documents</h2>
            <div className="mt-4 space-y-3">
              {data.documents.map((doc: any) => (
                <div key={doc.id} className="flex flex-col gap-2 border-t border-black/10 pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span>{doc.file_name}</span>
                  <a className="font-medium text-azure-deep" href={`${downloadBase}&format=document&documentId=${doc.id}`}>
                    Get signed link
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

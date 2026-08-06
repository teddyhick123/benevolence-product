import { notFound } from 'next/navigation';
import { ASSET_TYPE_LABELS } from '@/lib/schemas/portfolio';
import React from 'react';
import HoldingHeader from '@/components/holdings/HoldingHeader';
import ContactPhotoUpload from '@/components/profile/ContactPhotoUpload';
import EditableDescription from '@/components/profile/EditableDescription';
import EditableContactNotes from '@/components/profile/EditableContactNotes';
import HoldingWidgetsSection from '@/components/vis/HoldingWidgetsSection';
import NewsSection from '@/components/dashboard/NewsSection';
import FactRow from '@/components/ui/FactRow';
import LocationsManagerWrapper from '@/components/holdings/LocationsManagerWrapper';
import FinancialProfileSection from '@/components/holdings/FinancialProfileSection';
import ReportUploader from '@/components/holdings/ReportUploader';
import OrgSubmittedMetrics from '@/components/holdings/OrgSubmittedMetrics';
import GrantMilestonesWidget from '@/components/holdings/GrantMilestonesWidget';
import CustomFieldsPanel from '@/components/custom-fields/CustomFieldsPanel';
import Link from 'next/link';
import { getHoldingDetail, resolveHoldingPhotoUrl } from '@/lib/holdings/detail/queries';
import { buildHoldingDetailViewModel, humanDate } from '@/lib/holdings/detail/view-model';
import {
  addContribution,
  addFact,
  addHoldingLocation,
  deleteFact,
  deleteHoldingLocation,
  updateContactNotes,
  updateDescription,
  updateFact,
  updateHoldingBasics,
  updateHoldingContact,
  updateHoldingFunds,
  updateHoldingLocation,
  updateHoldingOrgFunding,
  updateTheoryOfAction,
} from '@/lib/holdings/detail/actions';
import HoldingAccessError from './HoldingAccessError';
import ReportDueCallout from './ReportDueCallout';


export default async function HoldingMiniDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ holdingId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { holdingId } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const qpPortfolio = sp?.portfolio_id;
  const qpPortfolioId = Array.isArray(qpPortfolio) ? qpPortfolio[0] : qpPortfolio;

  const detail = await getHoldingDetail(holdingId);
  const { holding, holdingError: holdingErr } = detail;
  if (!holding) {
    return <HoldingAccessError holdingId={holdingId} error={holdingErr} />;
  }

  // If a query param is provided, it must match the holding's portfolio for scope safety
  if (qpPortfolioId && String(qpPortfolioId) !== String(holding.portfolio_id)) return notFound();

  const portfolioId = String(holding.portfolio_id);
  const {
    facts,
    contributions,
    metricNames,
    locations,
    orgSubmittedFacts,
    linkedOrg,
    grantDetails,
  } = detail;
  const {
    totalContributions,
    funds,
    totalOrgFunding,
    kpiCards,
    location,
    legacyCostPerOutcome,
    hasBasicInfo,
    grantPeriodStatus,
  } = buildHoldingDetailViewModel(holding, facts, contributions, metricNames);

  const contact = {
    name: holding.primary_contact_name ?? null,
    email: holding.primary_contact_email ?? null,
    phone: holding.primary_contact_phone ?? null,
    website: holding.website ?? null,
    photo: await resolveHoldingPhotoUrl(holding.primary_contact_photo),
    notes: holding.primary_contact_notes ?? null,
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/dashboard/holdings" className="hover:text-neutral-800 transition-colors">Holdings</Link>
        <span>/</span>
        <span className="text-neutral-900 font-medium truncate">{holding.name}</span>
      </nav>

      {/* Header */}
      <HoldingHeader
        holdingId={holding.id}
        portfolioId={portfolioId}
        name={holding.name}
        assetClass={holding.asset_type}
        sector={holding.sector}
        location={location}
        status={holding.status}
        asOf={holding.as_of}
        funds={funds}
        contributionCount={totalContributions > 0 ? contributions.length : undefined}
        isManualFunds={totalContributions === 0 && holding.funds_allocated != null}
        grantPeriodStatus={grantPeriodStatus}
      />

      <CustomFieldsPanel
        orgId={holding.org_id}
        entityType="holding"
        entityId={holding.id}
      />

      <ReportDueCallout dueAt={grantDetails?.next_report_due} />

      {/* Grant Milestones */}
      <GrantMilestonesWidget portfolioId={portfolioId} holdingId={holdingId} />

      {/* Organization Submitted Metrics */}
      <OrgSubmittedMetrics
        holdingId={holding.id}
        pendingFacts={orgSubmittedFacts as any}
        linkedOrg={linkedOrg}
      />

      <details className="mt-3 rounded-2xl border border-neutral-200 bg-white shadow-sm p-5 open:shadow-md transition-shadow">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-800 hover:text-neutral-900">Edit Basic Information</summary>
        <form action={updateHoldingBasics} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="holding_id" value={holding.id} />

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Name *</span>
            <input
              name="name"
              defaultValue={holding.name}
              required
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              placeholder="Holding name"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Asset Class</span>
            <select
              name="asset_type"
              defaultValue={holding.asset_type ?? ''}
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure bg-white"
            >
              <option value="">— select —</option>
              {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Sector</span>
            <input
              name="sector"
              defaultValue={holding.sector ?? ''}
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              placeholder="e.g., Clean Energy, Healthcare"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Funds Allocated (USD)</span>
            <input
              name="funds_allocated"
              defaultValue={holding.funds_allocated ?? ''}
              type="number"
              step="0.01"
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              placeholder="0.00"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Status</span>
            <select
              name="status"
              defaultValue={holding.status ?? ''}
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure bg-white"
            >
              <option value="">— select —</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="committed">Committed</option>
              <option value="exited">Exited</option>
              <option value="written_off">Written Off</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">As of Date</span>
            <input
              type="date"
              name="as_of"
              defaultValue={holding.as_of ?? ''}
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
          </label>

          <label className="col-span-full block">
            <span className="text-xs font-medium text-neutral-700">Description</span>
            <textarea
              name="description"
              defaultValue={holding.description ?? ''}
              rows={3}
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure resize-y"
              placeholder="Brief description of the holding..."
            />
          </label>

          <label className="col-span-full block">
            <span className="text-xs font-medium text-neutral-700">Theory of Action</span>
            <textarea
              name="theory_of_action"
              defaultValue={holding.theory_of_action ?? ''}
              rows={4}
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure resize-y"
              placeholder="Describe the theory of change and expected impact..."
            />
          </label>

          <div className="col-span-full flex justify-end pt-2">
            <button type="submit" className="rounded-2xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors shadow-sm">
              Save Changes
            </button>
          </div>
        </form>
      </details>

      <details className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-5 open:shadow-md transition-shadow">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-800 hover:text-neutral-900">Edit Location</summary>
        <form action={updateHoldingLocation} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <input type="hidden" name="holding_id" value={holding.id} />

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">City</span>
            <input
              name="location_city"
              defaultValue={holding.location_city ?? ''}
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              placeholder="San Francisco"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">State / Region</span>
            <input
              name="location_state"
              defaultValue={holding.location_state ?? ''}
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              placeholder="California"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Country</span>
            <input
              name="location_country"
              defaultValue={holding.location_country ?? ''}
              className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              placeholder="United States"
            />
          </label>

          <div className="col-span-full flex justify-end pt-2">
            <button type="submit" className="rounded-2xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors shadow-sm">
              Save Changes
            </button>
          </div>
        </form>
      </details>

      {/* Primary Contact + Analytics Carousel */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Primary Contact Card - Narrower */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-700 mb-4">Primary Contact</h3>

          <div className="flex gap-4 items-start">
            {/* Profile Photo */}
            <ContactPhotoUpload
              holdingId={holding.id}
              currentPhoto={contact.photo}
              contactName={contact.name}
            />

            {/* Contact Info */}
            <div className="flex-1 min-w-0">
              {contact.name ? (
                <p className="font-semibold text-lg text-neutral-900 truncate">{contact.name}</p>
              ) : (
                <p className="text-neutral-500 text-sm">No name</p>
              )}

              {contact.website && (
                <p className="mt-2 flex items-center gap-2 text-sm text-neutral-700">
                  <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <a className="text-azure hover:text-azure-deep hover:underline truncate" href={contact.website} target="_blank" rel="noopener noreferrer">
                    {contact.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </p>
              )}

              {contact.email && (
                <p className="mt-1.5 flex items-center gap-2 text-sm text-neutral-700">
                  <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a className="text-azure hover:text-azure-deep hover:underline truncate" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                </p>
              )}

              {contact.phone && (
                <p className="mt-1.5 flex items-center gap-2 text-sm text-neutral-700">
                  <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <a className="text-azure hover:text-azure-deep hover:underline" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                </p>
              )}

              {!contact.website && !contact.email && !contact.phone && (
                <p className="text-neutral-500 text-sm mt-1">No contact information</p>
              )}
            </div>
          </div>

          {/* Contact Notes */}
          <div className="mt-4 pt-4 border-t border-neutral-200">
            <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Notes</h4>
            <EditableContactNotes
              holdingId={holding.id}
              notes={contact.notes ?? ''}
              updateAction={updateContactNotes}
            />
          </div>

          <details className="mt-5 pt-4 border-t border-neutral-200">
            <summary className="cursor-pointer text-sm font-medium text-neutral-700 hover:text-neutral-900">Edit Contact</summary>
            <form action={updateHoldingContact} className="mt-4 space-y-3">
              <input type="hidden" name="holding_id" value={holding.id} />

              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Name</span>
                <input
                  name="primary_contact_name"
                  defaultValue={contact.name ?? ''}
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="John Doe"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Email</span>
                <input
                  name="primary_contact_email"
                  defaultValue={contact.email ?? ''}
                  type="email"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="john@example.com"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Phone</span>
                <input
                  name="primary_contact_phone"
                  defaultValue={contact.phone ?? ''}
                  type="tel"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="+1 (555) 123-4567"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Website</span>
                <input
                  name="website"
                  defaultValue={contact.website ?? ''}
                  type="url"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="https://example.org"
                />
              </label>

              <p className="text-xs text-neutral-500">
                Tip: Click the profile photo above to upload an image.
              </p>

              <div className="flex justify-end pt-2">
                <button type="submit" className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors">
                  Save Changes
                </button>
              </div>
            </form>
          </details>

          {totalContributions === 0 && (
            <details className="mt-4 pt-4 border-t border-neutral-200">
              <summary className="cursor-pointer text-sm font-medium text-neutral-700 hover:text-neutral-900">Set Manual Funds</summary>
              <form action={updateHoldingFunds} className="mt-4 space-y-3">
                <input type="hidden" name="holding_id" value={holding.id} />
                <label className="block">
                  <span className="text-xs font-medium text-neutral-700">Amount (USD)</span>
                  <input
                    name="funds_allocated"
                    defaultValue={holding.funds_allocated ?? ''}
                    type="number"
                    step="0.01"
                    className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                    placeholder="0.00"
                  />
                </label>
                <p className="text-xs text-neutral-400">Note: Once contributions are added, they will override this manual value.</p>
                <div className="flex justify-end pt-2">
                  <button type="submit" className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors">
                    Save Changes
                  </button>
                </div>
              </form>
            </details>
          )}

          <details className="mt-4 pt-4 border-t border-neutral-200">
            <summary className="cursor-pointer text-sm font-medium text-neutral-700 hover:text-neutral-900">
              Set Total Org Funding
              {totalOrgFunding > 0 && (
                <span className="ml-2 text-xs text-neutral-500">
                  (${totalOrgFunding.toLocaleString()})
                </span>
              )}
            </summary>
            <form action={updateHoldingOrgFunding} className="mt-4 space-y-3">
              <input type="hidden" name="holding_id" value={holding.id} />
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Total Annual Budget (USD)</span>
                <input
                  name="total_org_funding"
                  defaultValue={holding.total_org_funding ?? ''}
                  type="number"
                  step="0.01"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="e.g., 10000000"
                />
              </label>
              <p className="text-xs text-neutral-400">
                Enter the organization&apos;s total annual funding/budget. This enables proportional impact attribution:
                your attributed outcomes = total outcomes × (your funding / org&apos;s total funding).
              </p>
              <div className="flex justify-end pt-2">
                <button type="submit" className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors">
                  Save Changes
                </button>
              </div>
            </form>
          </details>
        </div>

        {/* Analytics Carousel - Takes up 2 columns */}
        <div className="lg:col-span-2">
          <HoldingWidgetsSection
            holdingId={holding.id}
            portfolioId={portfolioId}
            canEdit={true}
          />
        </div>

      </section>

      {/* Public Financial Profile */}
      <section className="rounded-2xl border border-black/10 bg-white/50 p-5 shadow-sm">
        <FinancialProfileSection
          holdingId={holding.id}
          charityId={holding.charity_id}
        />
      </section>

      {/* Locations Manager */}
      <section>
        <LocationsManagerWrapper
          holdingId={holding.id}
          portfolioId={portfolioId}
          locations={locations as any}
          addAction={addHoldingLocation}
          updateAction={updateHoldingLocation}
          deleteAction={deleteHoldingLocation}
        />
      </section>

      {/* KPI Cards (latest per metric) */}
      <section>
        <h3 className="text-sm font-medium text-neutral-700">Key KPIs (Latest)</h3>
        {kpiCards.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-dashed border-black/10 p-6 text-sm text-neutral-600">
            No KPI facts yet for this holding.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kpiCards.map((m) => (
              <div key={m.key} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                <p className="text-xs text-neutral-500">{m.displayName}</p>
                <p className="mt-1 text-2xl font-semibold text-neutral-900">
                  {Number.isFinite(m.value) ? m.value.toLocaleString() : '—'}
                  <span className="text-sm font-normal text-neutral-500 ml-1">total</span>
                </p>
                {m.hasProportionalAttribution && m.attributedOutcomes != null && (
                  <p className="text-sm text-azure font-medium">
                    {m.attributedOutcomes.toLocaleString(undefined, { maximumFractionDigits: 1 })} attributed to you
                  </p>
                )}
                <p className="mt-1 text-[11px] text-neutral-500">Latest: {humanDate(m.updated_at)}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-2xl border border-neutral-200 p-2">
                    <p className="text-neutral-500">Cost / Outcome</p>
                    <p className="font-medium">
                      {m.costPerOutcome != null && isFinite(m.costPerOutcome)
                        ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(m.costPerOutcome)
                        : '—'}
                    </p>
                    {!m.hasProportionalAttribution && m.costPerOutcome != null && (
                      <p className="text-[9px] text-coral mt-0.5">* Not scaled</p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-neutral-200 p-2">
                    <p className="text-neutral-500">Your Outcomes / $1k</p>
                    <p className="font-medium">
                      {m.outcomesPerThousand != null && isFinite(m.outcomesPerThousand)
                        ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(m.outcomesPerThousand)
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upload End-of-Year Report */}
      <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-medium text-neutral-700 mb-4">Upload End-of-Year Report</h3>
        <ReportUploader
          holdingId={holding.id}
          portfolioId={portfolioId}
          holdingName={holding.name}
        />
      </section>

      {/* Description, Theory of Action, and Legacy Cost */}
      <div className="grid grid-cols-1 gap-4">
        {/* Description */}
        {holding.description && (
          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-neutral-700">Description</h3>
            <EditableDescription
              holdingId={holding.id}
              description={holding.description}
              updateAction={updateDescription}
            />
          </section>
        )}

        {/* Theory of Action */}
        {holding.theory_of_action && (
          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-neutral-700">Theory of Action</h3>
            <EditableDescription
              holdingId={holding.id}
              description={holding.theory_of_action}
              updateAction={updateTheoryOfAction}
            />
          </section>
        )}

        {/* Legacy Cost per Outcome */}
        {legacyCostPerOutcome && (
          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Legacy Cost/Outcome</h3>
            <p className="mt-2 text-2xl font-semibold text-neutral-900">{legacyCostPerOutcome}</p>
            <p className="mt-1 text-xs text-neutral-400">Manual entry (deprecated)</p>
          </section>
        )}

        {/* Recent News */}
        <NewsSection holdingId={holding.id} />
      </div>

      {/* History of Contributions */}
      <section>
        <h3 className="text-sm font-medium text-neutral-700 mb-3">History of Contributions</h3>
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="p-5 border-b border-neutral-200 bg-neutral-50/60">
            <h4 className="text-sm font-medium text-neutral-800 mb-4">Add New Contribution</h4>
            <form action={addContribution} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input type="hidden" name="portfolio_id" value={portfolioId} />
              <input type="hidden" name="holding_id" value={holding.id} />
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Amount (USD) *</span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="50000"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Date *</span>
                <input
                  type="date"
                  name="contributed_at"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Memo</span>
                <input
                  name="memo"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="Series A investment"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Source URL</span>
                <input
                  name="source"
                  type="url"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="https://..."
                />
              </label>
              <div className="flex items-end">
                <button type="submit" className="w-full rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors">
                  Add Contribution
                </button>
              </div>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Memo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {contributions.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-sm text-neutral-500 text-center" colSpan={3}>
                      No contributions recorded yet. Add your first contribution above.
                    </td>
                  </tr>
                ) : (
                  contributions.map((c) => (
                    <tr key={c.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-neutral-800">{humanDate(c.contribution_date)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                        {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(c.amount_usd)}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-800">{c.notes ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Facts Table (chronological) */}
      <section>
        <h3 className="text-sm font-medium text-neutral-700 mb-3">All Facts</h3>
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="p-5 border-b border-neutral-200 bg-neutral-50/60">
            <h4 className="text-sm font-medium text-neutral-800 mb-4">Add New Fact</h4>
            <form action={addFact} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input type="hidden" name="holding_id" value={holding.id} />
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Period End</span>
                <input
                  type="date"
                  name="period_end"
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Metric Code *</span>
                <input
                  name="metric_code"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="e.g. JOBS"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Value *</span>
                <input
                  name="value"
                  type="number"
                  step="any"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="e.g. 12"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Source URL</span>
                <input
                  name="source"
                  type="url"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="https://..."
                />
              </label>
              <div className="flex items-end">
                <button type="submit" className="w-full rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors">
                  Add Fact
                </button>
              </div>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Observed</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Metric</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {facts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-sm text-neutral-500 text-center" colSpan={5}>
                      No facts recorded yet. Add your first fact above.
                    </td>
                  </tr>
                ) : (
                  facts.map((f) => (
                    <FactRow
                      key={f.id}
                      fact={f}
                      holdingId={holding.id}
                      updateAction={updateFact}
                      deleteAction={deleteFact}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </div>
  );
}

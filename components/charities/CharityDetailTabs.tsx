'use client';

import { useState } from 'react';
import { DollarSign, TrendingUp, Heart, Activity, Mail, Phone, Globe, MapPin, ExternalLink } from 'lucide-react';

interface CharityData {
  id: string;
  ein: string;
  name: string;
  website?: string;
  mission?: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  total_revenue?: number;
  total_expenses?: number;
  net_assets?: number;
  charity_navigator_score?: number;
  charity_navigator_rating?: number;
  candid_seal?: string;
  propublica_score?: number;
  give_well_top_charity?: boolean;
  ntee_code?: string;
  impact_stories?: Array<{
    id: string;
    title: string;
    story_text: string;
    beneficiaries_impacted?: number;
    published_date?: string;
    image_url?: string;
  }>;
  recent_activity?: Array<{
    id: string;
    activity_type: string;
    title: string;
    description?: string;
    published_date?: string;
    source_url?: string;
  }>;
}

interface CharityDetailTabsProps {
  charity: CharityData;
}

type TabType = 'overview' | 'financials' | 'impact' | 'activity';

export default function CharityDetailTabs({ charity }: CharityDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const tabs: Array<{ id: TabType; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'financials', label: 'Financials' },
    { id: 'impact', label: 'Impact' },
    { id: 'activity', label: 'Activity' },
  ];

  const formatCurrency = (value?: number) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="rounded-2xl border border-black/5 bg-white shadow-soft">
      {/* Tab Navigation */}
      <div className="border-b border-black/5">
        <nav className="flex -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-azure text-azure'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-black/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-neutral-50 p-4 rounded-2xl">
                <div className="flex items-center mb-2">
                  <DollarSign className="w-5 h-5 text-neutral-600 mr-2" />
                  <h4 className="text-sm font-medium text-neutral-600">Total Revenue</h4>
                </div>
                <p className="text-2xl font-bold text-ink">
                  {formatCurrency(charity.total_revenue)}
                </p>
              </div>

              <div className="bg-neutral-50 p-4 rounded-2xl">
                <div className="flex items-center mb-2">
                  <TrendingUp className="w-5 h-5 text-neutral-600 mr-2" />
                  <h4 className="text-sm font-medium text-neutral-600">Net Assets</h4>
                </div>
                <p className="text-2xl font-bold text-ink">
                  {formatCurrency(charity.net_assets)}
                </p>
              </div>

              <div className="bg-neutral-50 p-4 rounded-2xl">
                <div className="flex items-center mb-2">
                  <Heart className="w-5 h-5 text-neutral-600 mr-2" />
                  <h4 className="text-sm font-medium text-neutral-600">CN Score</h4>
                </div>
                <p className="text-2xl font-bold text-ink">
                  {charity.charity_navigator_score ?? 'N/A'}
                </p>
              </div>
            </div>

            {/* Mission */}
            {charity.mission && (
              <div>
                <h3 className="text-lg font-semibold text-ink mb-2">Mission</h3>
                <p className="text-neutral-700 leading-relaxed">{charity.mission}</p>
              </div>
            )}

            {/* Contact Information */}
            <div>
              <h3 className="text-lg font-semibold text-ink mb-4">Contact Information</h3>
              <div className="space-y-3">
                {charity.website && (
                  <div className="flex items-center">
                    <Globe className="w-5 h-5 text-neutral-400 mr-3" />
                    <a href={charity.website} target="_blank" rel="noopener noreferrer" className="text-azure hover:underline">
                      {charity.website}
                    </a>
                  </div>
                )}
                {charity.email && (
                  <div className="flex items-center">
                    <Mail className="w-5 h-5 text-neutral-400 mr-3" />
                    <a href={`mailto:${charity.email}`} className="text-azure hover:underline">
                      {charity.email}
                    </a>
                  </div>
                )}
                {charity.phone && (
                  <div className="flex items-center">
                    <Phone className="w-5 h-5 text-neutral-400 mr-3" />
                    <span className="text-neutral-700">{charity.phone}</span>
                  </div>
                )}
                {(charity.address_line1 || charity.city || charity.state) && (
                  <div className="flex items-start">
                    <MapPin className="w-5 h-5 text-neutral-400 mr-3 mt-1" />
                    <div className="text-neutral-700">
                      {charity.address_line1 && <div>{charity.address_line1}</div>}
                      <div>
                        {[charity.city, charity.state, charity.zip].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FINANCIALS TAB */}
        {activeTab === 'financials' && (
          <div className="space-y-6">
            {/* Ratings */}
            {charity.charity_navigator_score != null ? (
              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">Charity Navigator</h3>
                <div className="bg-gradient-to-r from-azure/10 to-azure/20 p-6 rounded-2xl flex items-center gap-8">
                  <div>
                    <div className="text-4xl font-bold text-ink">{charity.charity_navigator_score}</div>
                    <div className="text-sm text-neutral-600 mt-1">Score (0–100)</div>
                  </div>
                  {charity.charity_navigator_rating != null && (
                    <div>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4].map(i => (
                          <svg key={i} className={`w-5 h-5 ${i <= charity.charity_navigator_rating ? 'text-azure' : 'text-neutral-200'}`} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        ))}
                      </div>
                      <div className="text-sm text-neutral-600 mt-1">{charity.charity_navigator_rating} / 4 stars</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-azure/10 border border-azure/20 rounded-2xl p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-azure/10 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <h3 className="text-lg font-semibold text-ink mb-2">Ratings Coming Soon</h3>
                <p className="text-neutral-600 text-sm">
                  Charity ratings from Charity Navigator will be available once API keys are configured.
                </p>
              </div>
            )}

            {/* Candid Seal */}
            {charity.candid_seal && (
              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">Candid (GuideStar) Seal</h3>
                <div className="bg-sunset/15 p-4 rounded-2xl">
                  <span className="text-sm text-neutral-600">Seal Level: </span>
                  <span className="font-semibold text-ink capitalize">{charity.candid_seal}</span>
                </div>
              </div>
            )}

            {/* GiveWell */}
            {charity.give_well_top_charity && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                <span className="font-semibold text-green-800">GiveWell Top Charity</span>
              </div>
            )}

            {/* Financial Overview */}
            <div>
              <h3 className="text-lg font-semibold text-ink mb-4">Financial Overview</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-black/5">
                  <span className="text-neutral-600">Total Revenue</span>
                  <span className="font-semibold text-ink">{formatCurrency(charity.total_revenue)}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-black/5">
                  <span className="text-neutral-600">Total Expenses</span>
                  <span className="font-semibold text-ink">{formatCurrency(charity.total_expenses)}</span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-neutral-600">Net Assets</span>
                  <span className="font-semibold text-ink">{formatCurrency(charity.net_assets)}</span>
                </div>
              </div>
            </div>

            {/* Public Filings & Records */}
            {charity.ein && (() => {
              const einClean = charity.ein.replace(/-/g, '');
              const propublicaUrl = `https://projects.propublica.org/nonprofits/organizations/${einClean}`;
              return (
                <div className="bg-neutral-50 border border-black/5 rounded-2xl p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-700">Public Filings &amp; Records</h3>
                  <div className="space-y-2">
                    <a
                      href={propublicaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-azure hover:underline"
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0" />
                      ProPublica Nonprofit Explorer — Form 990 filings
                    </a>
                    <a
                      href="https://www.irs.gov/charities-non-profits/tax-exempt-organization-search"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-azure hover:underline"
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0" />
                      IRS Tax Exempt Organization Search
                    </a>
                  </div>
                  <p className="text-xs text-neutral-400">Form 990 documents are public records filed annually with the IRS.</p>
                </div>
              );
            })()}
          </div>
        )}

        {/* IMPACT TAB */}
        {activeTab === 'impact' && (
          <div className="space-y-6">
            {charity.impact_stories && charity.impact_stories.length > 0 ? (
              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">Impact Stories</h3>
                <div className="space-y-4">
                  {charity.impact_stories.map((story) => (
                    <div key={story.id} className="border border-black/5 rounded-2xl p-4">
                      {story.image_url && (
                        <img src={story.image_url} alt={story.title} className="w-full h-48 object-cover rounded-2xl mb-4" />
                      )}
                      <h4 className="text-lg font-semibold text-ink mb-2">{story.title}</h4>
                      <p className="text-neutral-700 mb-3">{story.story_text}</p>
                      <div className="flex items-center justify-between text-sm text-neutral-500">
                        {story.beneficiaries_impacted && (
                          <span>{story.beneficiaries_impacted.toLocaleString()} people impacted</span>
                        )}
                        {story.published_date && <span>{formatDate(story.published_date)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Heart className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                <p className="text-neutral-500">No impact stories available yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            {charity.recent_activity && charity.recent_activity.length > 0 ? (
              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">Recent Activity</h3>
                <div className="space-y-4">
                  {charity.recent_activity.map((activity) => (
                    <div key={activity.id} className="border-l-4 border-azure pl-4 py-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <span className="inline-block px-2 py-1 bg-azure/10 text-azure-deep text-xs font-medium rounded mb-2">
                            {activity.activity_type.replace('_', ' ')}
                          </span>
                          <h4 className="text-base font-semibold text-ink mb-1">{activity.title}</h4>
                          {activity.description && (
                            <p className="text-neutral-700 mb-2">{activity.description}</p>
                          )}
                          {activity.source_url && (
                            <a href={activity.source_url} target="_blank" rel="noopener noreferrer" className="text-sm text-azure hover:underline">
                              Read more →
                            </a>
                          )}
                        </div>
                        {activity.published_date && (
                          <span className="text-sm text-neutral-500 ml-4">{formatDate(activity.published_date)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Activity className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                <p className="text-neutral-500">No recent activity available.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { DollarSign, TrendingUp, Heart, Activity, Mail, Phone, Globe, MapPin } from 'lucide-react';

interface CharityData {
  id: string;
  ein: string;
  name: string;
  legal_name?: string;
  website?: string;
  sector?: string;
  mission_statement?: string;
  description?: string;
  annual_revenue?: number;
  annual_expenses?: number;
  assets?: number;
  program_expense_ratio?: number;
  charity_navigator_rating?: {
    score?: number;
    rating?: string;
    financial_score?: number;
    accountability_score?: number;
  };
  candid_rating?: {
    seal_level?: string;
    transparency_level?: string;
  };
  impact_metrics?: {
    beneficiaries_served?: number;
    [key: string]: any;
  };
  contact_email?: string;
  contact_phone?: string;
  street_address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
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
    <div className="bg-white rounded-lg shadow">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center mb-2">
                  <DollarSign className="w-5 h-5 text-gray-600 mr-2" />
                  <h4 className="text-sm font-medium text-gray-600">Annual Revenue</h4>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(charity.annual_revenue)}
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center mb-2">
                  <TrendingUp className="w-5 h-5 text-gray-600 mr-2" />
                  <h4 className="text-sm font-medium text-gray-600">Program Expense Ratio</h4>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {charity.program_expense_ratio ? `${(charity.program_expense_ratio * 100).toFixed(1)}%` : 'N/A'}
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center mb-2">
                  <Heart className="w-5 h-5 text-gray-600 mr-2" />
                  <h4 className="text-sm font-medium text-gray-600">Beneficiaries Served</h4>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {charity.impact_metrics?.beneficiaries_served?.toLocaleString() || 'N/A'}
                </p>
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
              <div className="space-y-3">
                {charity.website && (
                  <div className="flex items-center">
                    <Globe className="w-5 h-5 text-gray-400 mr-3" />
                    <a href={charity.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {charity.website}
                    </a>
                  </div>
                )}
                {charity.contact_email && (
                  <div className="flex items-center">
                    <Mail className="w-5 h-5 text-gray-400 mr-3" />
                    <a href={`mailto:${charity.contact_email}`} className="text-blue-600 hover:underline">
                      {charity.contact_email}
                    </a>
                  </div>
                )}
                {charity.contact_phone && (
                  <div className="flex items-center">
                    <Phone className="w-5 h-5 text-gray-400 mr-3" />
                    <span className="text-gray-700">{charity.contact_phone}</span>
                  </div>
                )}
                {(charity.street_address || charity.city || charity.state) && (
                  <div className="flex items-start">
                    <MapPin className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                    <div className="text-gray-700">
                      {charity.street_address && <div>{charity.street_address}</div>}
                      <div>
                        {[charity.city, charity.state, charity.zip_code].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            {charity.description && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">About</h3>
                <p className="text-gray-700 leading-relaxed">{charity.description}</p>
              </div>
            )}
          </div>
        )}

        {/* FINANCIALS TAB */}
        {activeTab === 'financials' && (
          <div className="space-y-6">
            {/* Ratings Not Available Message */}
            {!charity.charity_navigator_rating && !charity.candid_rating && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                <div className="text-4xl mb-3">📊</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Ratings Coming Soon</h3>
                <p className="text-gray-600 mb-4">
                  Charity ratings from Charity Navigator and Candid will be available once API keys are configured.
                </p>
                <p className="text-sm text-gray-500">
                  In the meantime, you can view financial data and add this charity to your portfolio.
                </p>
              </div>
            )}

            {/* Charity Navigator Rating */}
            {charity.charity_navigator_rating && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Charity Navigator Rating</h3>
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-4xl font-bold text-blue-900">
                        {charity.charity_navigator_rating.score || 'N/A'}
                      </div>
                      {charity.charity_navigator_rating.rating && (
                        <div className="text-xl font-semibold text-blue-700 mt-1">
                          Grade: {charity.charity_navigator_rating.rating}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {charity.charity_navigator_rating.financial_score && (
                      <div>
                        <div className="text-sm text-gray-600">Financial Health</div>
                        <div className="text-2xl font-semibold text-gray-900">
                          {charity.charity_navigator_rating.financial_score}
                        </div>
                      </div>
                    )}
                    {charity.charity_navigator_rating.accountability_score && (
                      <div>
                        <div className="text-sm text-gray-600">Accountability</div>
                        <div className="text-2xl font-semibold text-gray-900">
                          {charity.charity_navigator_rating.accountability_score}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Financial Overview */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Overview</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-gray-600">Annual Revenue</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(charity.annual_revenue)}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-gray-600">Annual Expenses</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(charity.annual_expenses)}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-gray-600">Total Assets</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(charity.assets)}</span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-gray-600">Program Expense Ratio</span>
                  <span className="font-semibold text-gray-900">
                    {charity.program_expense_ratio ? `${(charity.program_expense_ratio * 100).toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Candid Rating */}
            {charity.candid_rating && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Candid (GuideStar) Seal</h3>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  {charity.candid_rating.seal_level && (
                    <div className="mb-2">
                      <span className="text-sm text-gray-600">Seal Level: </span>
                      <span className="font-semibold text-gray-900 capitalize">
                        {charity.candid_rating.seal_level}
                      </span>
                    </div>
                  )}
                  {charity.candid_rating.transparency_level && (
                    <div>
                      <span className="text-sm text-gray-600">Transparency: </span>
                      <span className="font-semibold text-gray-900 capitalize">
                        {charity.candid_rating.transparency_level}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* IMPACT TAB */}
        {activeTab === 'impact' && (
          <div className="space-y-6">
            {/* Impact Stories */}
            {charity.impact_stories && charity.impact_stories.length > 0 ? (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Impact Stories</h3>
                <div className="space-y-4">
                  {charity.impact_stories.map((story) => (
                    <div key={story.id} className="border border-gray-200 rounded-lg p-4">
                      {story.image_url && (
                        <img
                          src={story.image_url}
                          alt={story.title}
                          className="w-full h-48 object-cover rounded-lg mb-4"
                        />
                      )}
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">{story.title}</h4>
                      <p className="text-gray-700 mb-3">{story.story_text}</p>
                      <div className="flex items-center justify-between text-sm text-gray-500">
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
                <Heart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No impact stories available yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            {charity.recent_activity && charity.recent_activity.length > 0 ? (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-4">
                  {charity.recent_activity.map((activity) => (
                    <div key={activity.id} className="border-l-4 border-blue-500 pl-4 py-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded mb-2">
                            {activity.activity_type.replace('_', ' ')}
                          </span>
                          <h4 className="text-base font-semibold text-gray-900 mb-1">{activity.title}</h4>
                          {activity.description && (
                            <p className="text-gray-700 mb-2">{activity.description}</p>
                          )}
                          {activity.source_url && (
                            <a
                              href={activity.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline"
                            >
                              Read more →
                            </a>
                          )}
                        </div>
                        {activity.published_date && (
                          <span className="text-sm text-gray-500 ml-4">{formatDate(activity.published_date)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No recent activity available.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

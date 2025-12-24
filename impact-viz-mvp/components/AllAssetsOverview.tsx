'use client';

import React, { useEffect, useState } from 'react';
import { ASSET_TYPE_COLORS, ASSET_TYPE_LABELS, AssetType } from '@/lib/schemas/portfolio';
import HoldingsPieWidget from '@/components/vis/HoldingsPieWidget';
import AISummaryCard from '@/components/AISummaryCard';

type AssetTypeBreakdown = {
  asset_type: AssetType;
  total_value: number;
  holdings_count: number;
  percentage: number;
};

type AllAssetsData = {
  total_value: number;
  total_holdings: number;
  asset_types_count: number;
  active_holdings: number;
  average_size: number;
  last_updated: string | null;
  asset_type_breakdown: AssetTypeBreakdown[];
};

type Props = {
  portfolioId: string;
  investmentSummary: any;
  grantSummary: any;
  donationSummary: any;
};

export default function AllAssetsOverview({
  portfolioId,
  investmentSummary,
  grantSummary,
  donationSummary,
}: Props) {
  const [data, setData] = useState<AllAssetsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Fetch holdings data to calculate accurate breakdown
    const fetchAndCalculateData = async () => {
      try {
        setLoading(true);

        // Fetch all holdings for this portfolio
        const response = await fetch(`/api/portfolio/${portfolioId}/holdings?limit=1000`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch holdings');
        }

        const result = await response.json();
        const holdings = result.data || [];

        // Calculate breakdown by asset type
        const breakdownMap = new Map<AssetType, { total_value: number; holdings_count: number }>();
        let totalValue = 0;
        let totalHoldings = 0;
        let activeHoldings = 0;

        holdings.forEach((holding: any) => {
          const assetType = holding.asset_type as AssetType;
          const value = Number(holding.funds_allocated || holding.nav || 0);
          const isActive = holding.status === 'Active';

          totalValue += value;
          totalHoldings++;
          if (isActive) activeHoldings++;

          if (assetType) {
            const current = breakdownMap.get(assetType) || { total_value: 0, holdings_count: 0 };
            breakdownMap.set(assetType, {
              total_value: current.total_value + value,
              holdings_count: current.holdings_count + 1,
            });
          }
        });

        // Convert map to array and calculate percentages
        const breakdown: AssetTypeBreakdown[] = [];
        breakdownMap.forEach((value, assetType) => {
          breakdown.push({
            asset_type: assetType,
            total_value: value.total_value,
            holdings_count: value.holdings_count,
            percentage: totalValue > 0 ? (value.total_value / totalValue) * 100 : 0,
          });
        });

        // Sort by value descending
        breakdown.sort((a, b) => b.total_value - a.total_value);

        const avgSize = totalHoldings > 0 ? totalValue / totalHoldings : 0;

        if (mounted) {
          setData({
            total_value: totalValue,
            total_holdings: totalHoldings,
            asset_types_count: breakdown.length,
            active_holdings: activeHoldings,
            average_size: avgSize,
            last_updated: new Date().toISOString(),
            asset_type_breakdown: breakdown,
          });
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching holdings data:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchAndCalculateData();

    return () => {
      mounted = false;
    };
  }, [portfolioId]);

  if (loading || !data) {
    return (
      <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-500">
        Loading portfolio overview...
      </div>
    );
  }

  // Aggregate into three main buckets for pie chart
  // Using sunset color palette consistent with RadialProgress widget
  const bucketsData = {
    investments: { value: 0, count: 0, color: '#5186a6' },
    grants: { value: 0, count: 0, color: '#e07a5f' },
    donations: { value: 0, count: 0, color: '#f4a261' },
  };

  data.asset_type_breakdown.forEach((item) => {
    if (['equity_investment', 'debt_investment', 'pri', 'mri'].includes(item.asset_type)) {
      bucketsData.investments.value += item.total_value;
      bucketsData.investments.count += item.holdings_count;
    } else if (['foundation_grant', 'daf_grant'].includes(item.asset_type)) {
      bucketsData.grants.value += item.total_value;
      bucketsData.grants.count += item.holdings_count;
    } else if (item.asset_type === 'donation') {
      bucketsData.donations.value += item.total_value;
      bucketsData.donations.count += item.holdings_count;
    }
  });

  // Prepare data for pie chart (3 segments only)
  const pieChartData = [
    { label: 'Investments', value: bucketsData.investments.value },
    { label: 'Grants', value: bucketsData.grants.value },
    { label: 'Donations', value: bucketsData.donations.value },
  ].filter(item => item.value > 0);

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Total Card with Everything */}
      <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6">
        <h3 className="text-sm font-medium text-neutral-600 mb-4">Portfolio Overview</h3>

        <div className="flex items-start gap-6">
          {/* Left: Total and Breakdown */}
          <div className="flex-1 space-y-4">
            {/* Total Value */}
            <div>
              <div className="text-4xl font-serif font-semibold text-neutral-900">
                {formatMoney(data.total_value)}
              </div>
              <div className="text-sm text-neutral-500 mt-1">Total Funds Contributed</div>
            </div>

            {/* Three Bucket Breakdown */}
            <div className="space-y-2 pt-2">
              {bucketsData.investments.value > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: bucketsData.investments.color }} />
                    <span className="text-neutral-700">Investments</span>
                  </div>
                  <span className="font-medium text-neutral-900">{formatMoney(bucketsData.investments.value)}</span>
                </div>
              )}
              {bucketsData.grants.value > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: bucketsData.grants.color }} />
                    <span className="text-neutral-700">Grants</span>
                  </div>
                  <span className="font-medium text-neutral-900">{formatMoney(bucketsData.grants.value)}</span>
                </div>
              )}
              {bucketsData.donations.value > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: bucketsData.donations.color }} />
                    <span className="text-neutral-700">Donations</span>
                  </div>
                  <span className="font-medium text-neutral-900">{formatMoney(bucketsData.donations.value)}</span>
                </div>
              )}
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-black/5">
              <div>
                <div className="text-2xl font-semibold text-neutral-900">{data.total_holdings}</div>
                <div className="text-xs text-neutral-500">Holdings</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-neutral-900">{data.active_holdings}</div>
                <div className="text-xs text-neutral-500">Active</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-neutral-900">{formatMoney(data.average_size)}</div>
                <div className="text-xs text-neutral-500">Average Value</div>
              </div>
            </div>
          </div>

          {/* Right: Small Donut Chart with Legend */}
          {pieChartData.length > 0 && (
            <div className="shrink-0">
              <HoldingsPieWidget
                data={pieChartData}
                colorBy="default"
                size={140}
                innerRadius={45}
                showLegend={true}
                customColors={{
                  'Investments': bucketsData.investments.color,
                  'Grants': bucketsData.grants.color,
                  'Donations': bucketsData.donations.color,
                }}
              />
            </div>
          )}
        </div>

        {/* AI Summary - Integrated */}
        <div className="mt-6 pt-6 border-t border-black/5">
          <h4 className="text-sm font-medium text-neutral-600 mb-3">Summary</h4>
          <AISummaryCard portfolioId={portfolioId} />
        </div>
      </div>
    </div>
  );
}

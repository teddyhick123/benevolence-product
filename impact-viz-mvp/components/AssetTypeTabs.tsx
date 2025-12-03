'use client';

import React, { useState } from 'react';
import { AssetType, INVESTMENT_ASSET_TYPES, GRANT_ASSET_TYPES, DONATION_ASSET_TYPES } from '@/lib/schemas/portfolio';

export type AssetTypeTab = 'all' | 'investments' | 'grants' | 'donations';

type Props = {
  activeTab: AssetTypeTab;
  onChange: (tab: AssetTypeTab) => void;
  counts?: {
    all: number;
    investments: number;
    grants: number;
    donations: number;
  };
};

export default function AssetTypeTabs({ activeTab, onChange, counts }: Props) {
  const tabs: Array<{ key: AssetTypeTab; label: string; icon: React.ReactNode }> = [
    {
      key: 'all',
      label: 'All Assets',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      key: 'investments',
      label: 'Investments',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      key: 'grants',
      label: 'Grants',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      key: 'donations',
      label: 'Donations',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="border-b border-black/5">
      <div className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = counts?.[tab.key];

          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`
                group relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                transition-all duration-200
                ${
                  isActive
                    ? 'text-azure'
                    : 'text-neutral-600 hover:text-neutral-900'
                }
              `}
            >
              {/* Icon */}
              <span
                className={`
                  transition-colors duration-200
                  ${isActive ? 'text-azure' : 'text-neutral-400 group-hover:text-neutral-600'}
                `}
              >
                {tab.icon}
              </span>

              {/* Label */}
              <span>{tab.label}</span>

              {/* Count Badge */}
              {count !== undefined && count > 0 && (
                <span
                  className={`
                    inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium
                    transition-colors duration-200
                    ${
                      isActive
                        ? 'bg-azure/10 text-azure'
                        : 'bg-neutral-100 text-neutral-600 group-hover:bg-neutral-200'
                    }
                  `}
                >
                  {count}
                </span>
              )}

              {/* Active Indicator */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-azure" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Helper function to get asset types for a given tab
 */
export function getAssetTypesForTab(tab: AssetTypeTab): AssetType[] | null {
  switch (tab) {
    case 'all':
      return null; // null means no filter
    case 'investments':
      return INVESTMENT_ASSET_TYPES;
    case 'grants':
      return GRANT_ASSET_TYPES;
    case 'donations':
      return DONATION_ASSET_TYPES;
    default:
      return null;
  }
}

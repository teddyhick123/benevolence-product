'use client';

import { CheckCircleIcon, ArrowRightIcon, SparklesIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { branding } from '@/lib/config';

interface OnboardingCompleteProps {
  organizationId?: string;
  enabledModules: string[];
}

const MODULE_NAMES: Record<string, string> = {
  impact_tracking: 'Impact Tracking',
  reporting: 'Reporting',
  tax_optimization: 'Tax Optimization',
  grant_management: 'Grant Management',
  donor_management: 'Donor Management',
  external_data: 'External Data',
  analytics: 'Analytics',
};

export default function OnboardingComplete({
  organizationId,
  enabledModules,
}: OnboardingCompleteProps) {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      {/* Success animation */}
      <div className="relative inline-flex items-center justify-center mb-8">
        <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-25" />
        <div className="relative w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircleIcon className="w-12 h-12 text-green-600" />
        </div>
      </div>

      {/* Headline */}
      <h1 className="text-3xl font-bold text-neutral-900 mb-3">
        You&apos;re All Set!
      </h1>
      <p className="text-lg text-neutral-600 mb-8">
        Your workspace is ready with personalized modules for your needs.
      </p>

      {/* Enabled modules */}
      <div className="bg-neutral-50 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
          Enabled Modules
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {enabledModules.map((moduleId) => (
            <span
              key={moduleId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 rounded-full text-sm text-neutral-700"
            >
              <SparklesIcon className="w-4 h-4 text-azure" />
              {MODULE_NAMES[moduleId] || moduleId}
            </span>
          ))}
        </div>
      </div>

      {/* Next steps */}
      <div className="text-left bg-white border border-neutral-200 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
          What&apos;s Next?
        </h2>
        <ul className="space-y-4">
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 bg-azure/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-azure text-sm font-medium">1</span>
            </div>
            <div>
              <p className="font-medium text-neutral-900">Explore your dashboard</p>
              <p className="text-sm text-neutral-600">
                See your personalized workspace with the modules we set up for you.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 bg-azure/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-azure text-sm font-medium">2</span>
            </div>
            <div>
              <p className="font-medium text-neutral-900">Add your first portfolio</p>
              <p className="text-sm text-neutral-600">
                Create a portfolio to start tracking your impact and holdings.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 bg-azure/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-azure text-sm font-medium">3</span>
            </div>
            <div>
              <p className="font-medium text-neutral-900">Chat with {branding.assistantName} anytime</p>
              <p className="text-sm text-neutral-600">
                Your AI assistant is always available to help manage your portfolio.
              </p>
            </div>
          </li>
        </ul>
      </div>

      {/* CTA */}
      <Link
        href={organizationId ? `/org/${organizationId}` : '/dashboard'}
        className="inline-flex items-center gap-2 px-8 py-4 bg-azure text-white rounded-xl font-semibold hover:bg-azure/90 transition-colors"
      >
        Go to Dashboard
        <ArrowRightIcon className="w-5 h-5" />
      </Link>

      {/* Help link */}
      <p className="mt-6 text-sm text-neutral-500">
        Need help? Check out our{' '}
        <a href="/help" className="text-azure hover:underline">
          getting started guide
        </a>
        .
      </p>
    </div>
  );
}

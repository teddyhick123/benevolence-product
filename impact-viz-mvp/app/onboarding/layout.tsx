import { Metadata } from 'next';
import { branding, getPageTitle } from '@/lib/config';

export const metadata: Metadata = {
  title: getPageTitle('Get Started'),
  description: 'Set up your personalized workspace with AI-powered onboarding',
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-neutral-50 to-white">
      {/* Simple header */}
      <header className="flex-shrink-0 border-b border-neutral-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-azure rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">{branding.appName.charAt(0)}</span>
            </div>
            <span className="font-semibold text-neutral-900">{branding.appName}</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden max-w-7xl w-full mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  );
}

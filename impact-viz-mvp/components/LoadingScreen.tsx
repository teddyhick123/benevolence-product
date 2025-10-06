'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import TrefoilLoader from './TrefoilLoader';

export default function LoadingScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Intercept link clicks to show loading immediately
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');

      if (link && link.href && !link.target && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const url = new URL(link.href);
        // Only show loading for internal navigation
        if (url.origin === window.location.origin && url.pathname !== pathname) {
          setIsTransitioning(true);
        }
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [pathname]);

  // Track route changes
  useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => {
      setIsTransitioning(false);
    }, 800); // Show loading for 800ms during transitions

    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  // Initial page load
  useEffect(() => {
    const handleLoad = () => {
      setTimeout(() => setIsLoading(false), 300);
    };

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, []);

  const shouldShow = isLoading || isTransitioning;

  return (
    <div
      className={`fixed inset-0 z-[100000] flex items-center justify-center bg-white/80 backdrop-blur-md transition-opacity duration-500 pointer-events-none ${
        shouldShow ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="text-center space-y-4">
        {/* Trefoil Knot Loader */}
        <div className="flex justify-center">
          <TrefoilLoader className="w-16 h-16 text-azure" />
        </div>

        {/* Loading text */}
        <p className="text-lg font-semibold text-neutral-900">Loading</p>
      </div>
    </div>
  );
}

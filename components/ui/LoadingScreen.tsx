'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import TrefoilLoader from './TrefoilLoader';

function LoadingScreenContent() {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousLocation = useRef(`${pathname}?${searchParams.toString()}`);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Intercept link clicks to show loading immediately
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');

      if (link && link.href && !link.target && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        const url = new URL(link.href);
        const currentUrl = new URL(window.location.href);

        // Show the indicator only for actual same-window application navigations.
        // Anchor links are immediate and should not be treated as a loading state.
        if (
          url.origin === window.location.origin
          && (url.pathname !== currentUrl.pathname || url.search !== currentUrl.search)
        ) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setIsTransitioning(true);
          // A failed navigation should never leave a persistent progress indicator.
          timeoutRef.current = setTimeout(() => setIsTransitioning(false), 5000);
        }
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [pathname]);

  // Resolve the indicator as soon as the App Router commits the destination.
  useEffect(() => {
    const nextLocation = `${pathname}?${searchParams.toString()}`;
    if (nextLocation !== previousLocation.current) {
      previousLocation.current = nextLocation;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsTransitioning(false);
    }
  }, [pathname, searchParams]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <div
      aria-hidden={!isTransitioning}
      className={`fixed inset-0 z-[100000] flex items-center justify-center bg-white/80 backdrop-blur-md pointer-events-none transition-opacity duration-500 ${
        isTransitioning ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex flex-col items-center gap-4">
        <TrefoilLoader className="w-16 h-16 text-azure" />
        <div className="h-1 w-32 overflow-hidden rounded-full bg-azure/20">
          <div
            className={`h-full w-full origin-left bg-azure transition-transform duration-200 ease-out ${
              isTransitioning ? 'scale-x-100' : 'scale-x-0'
            }`}
          />
        </div>
      </div>
    </div>
  );
}

export default function LoadingScreen() {
  return (
    <Suspense fallback={null}>
      <LoadingScreenContent />
    </Suspense>
  );
}

'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-creme">
      <Link href="/" className="font-serif text-4xl leading-none text-azure">B.</Link>
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold text-neutral-900">Something went wrong</h1>
        <p className="text-sm text-neutral-500 max-w-sm">
          An unexpected error occurred. Please try again or return to the dashboard.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-md bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm shadow-soft hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-md border border-black/10 bg-white text-sm hover:shadow transition-all"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}

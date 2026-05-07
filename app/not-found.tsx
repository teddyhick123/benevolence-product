import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-creme">
      <Link href="/" className="font-serif text-4xl leading-none text-azure">B.</Link>
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-neutral-400 tracking-widest uppercase">404</p>
        <h1 className="text-2xl font-semibold text-neutral-900">Page not found</h1>
        <p className="text-sm text-neutral-500 max-w-sm">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="px-4 py-2 rounded-md bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm shadow-soft hover:opacity-90 transition-opacity"
      >
        Return to dashboard
      </Link>
    </div>
  );
}

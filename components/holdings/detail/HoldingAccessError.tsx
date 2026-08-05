export default function HoldingAccessError({
  holdingId,
  error,
}: {
  holdingId: string;
  error: unknown | null;
}) {
  const errorMessage = error instanceof Error
    ? error.message
    : (error as { message?: unknown })?.message || error;

  return (
    <div className="m-6 rounded-2xl border border-sunset/40 bg-sunset/15 p-5 text-sm text-ink">
      <div className="font-medium mb-1">
        Couldn’t load holding <code className="font-mono">{holdingId}</code>.
      </div>
      {error ? (
        <div>Supabase error: <code className="font-mono">{String(errorMessage)}</code></div>
      ) : (
        <div>
          No error message was returned. This usually means <strong>RLS prevented the row from being read</strong>{' '}
          (missing membership) or the request wasn’t authenticated (cookies not present).
        </div>
      )}
      <div className="mt-2 text-neutral-700">
        If you prefer the 404 again later, we can switch this back once it’s working.
      </div>
    </div>
  );
}

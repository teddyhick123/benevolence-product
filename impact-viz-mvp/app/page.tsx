export default function Home() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 text-center">
      {/* Brand mark */}
      <div className="inline-flex items-center justify-center gap-2 mb-3">
        <span className="font-playfair text-3xl leading-none text-azure">B.</span>
        <span className="sr-only">Benevolence</span>
      </div>

      <h1 className="font-playfair text-5xl font-bold tracking-tight text-ink">
        Benevolence
      </h1>
      <p className="mt-4 text-neutral-700">
        Impact investing analytics—clear, current, and actionable.
      </p>

      <div className="mt-8 flex items-center justify-center gap-3">
        <a
          href="/login"
          className="px-6 py-3 rounded-2xl bg-azure text-white shadow-soft hover:opacity-90 transition"
        >
          Sign in
        </a>
        <a
          href="/dashboard"
          className="px-6 py-3 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
        >
          View dashboard
        </a>
      </div>
    </div>
  );
}
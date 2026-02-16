import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)] py-6">
        <div className="max-w-3xl mx-auto px-4">
          <Link
            href="/"
            className="text-sm text-[var(--accent)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-[var(--background)] rounded"
          >
            ← Back to scanner
          </Link>
        </div>
      </header>
      <main id="main-content" className="max-w-3xl mx-auto px-4 py-12" tabIndex={-1}>
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">Page not found</h1>
        <p className="text-[var(--muted)]">
          The page you requested does not exist.
        </p>
        <p className="mt-4">
          <Link
            href="/"
            className="text-sm text-[var(--accent)] hover:opacity-90 underline focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-[var(--background)] rounded"
          >
            Go to IR AI Readiness Scanner
          </Link>
        </p>
      </main>
    </div>
  );
}

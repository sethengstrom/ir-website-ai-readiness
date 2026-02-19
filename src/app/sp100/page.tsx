import Link from "next/link";
import { SP100_RESULTS } from "@/data/sp100-results";
import { APP_VERSION } from "@/lib/version";
import SP100Table from "./SP100Table";

export const metadata = {
  title: "S&P 100 results | IR AI Readiness Scanner",
  description: "Scanner results for the 100 largest companies in the S&P 500 (by market cap).",
};

function formatLastScanDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  const [, y, m, d] = match;
  const month = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long" });
  return `${month} ${Number(d)}, ${y}`;
}

export default function SP100Page() {
  const lastScanned = SP100_RESULTS.reduce<string | null>((latest, row) => {
    const d = row.lastScanned?.trim();
    if (!d) return latest;
    if (!latest) return d;
    return d > latest ? d : latest;
  }, null);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)] bg-[var(--card)]/50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href="/" className="text-sm text-[var(--accent)] hover:opacity-90">
            ← Back to scanner
          </Link>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mt-2">
            S&P 100 scanner results
          </h1>
          <p className="text-[var(--muted)] text-base mt-1">
            IR AI readiness for the 100 largest companies in the S&P 500 (by market cap)
          </p>
          <p className="text-[var(--muted)] text-sm mt-2">
            Scores are from our scanner (server-rendered HTML only). Use the scanner to run or refresh results for any domain.
          </p>
          <p className="text-zinc-400 text-sm mt-1">
            Last scan: <span className="text-[var(--foreground)] font-medium">{formatLastScanDate(lastScanned ?? undefined)}</span>
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-6xl mx-auto px-4 py-8" tabIndex={-1}>
        <SP100Table rows={SP100_RESULTS} />

        <p className="text-zinc-500 text-sm mt-4">
          Overall = overall readiness (0–100). Crawl = crawlability, Struct = structured data, Parse = parseability, Fresh = freshness, IR list = IR checklist. Empty scores (—) mean not yet scanned; click Scan to run the scanner for that domain.
        </p>

        <footer className="mt-10 pt-6 border-t border-[var(--card-border)]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/methodology"
              className="text-sm text-emerald-400 hover:text-emerald-300 underline focus:outline-none focus:ring-2 focus:ring-emerald-500/50 rounded"
            >
              Scoring methodology
            </Link>
            <Link
              href="/changelog"
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-emerald-500/50 rounded"
              title="Changelog"
            >
              v{APP_VERSION}
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}

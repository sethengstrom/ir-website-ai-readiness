import Link from "next/link";
import { SP100_RESULTS } from "@/data/sp100-results";
import type { SP100Row } from "@/data/sp100-types";
import { APP_VERSION } from "@/lib/version";

export const metadata = {
  title: "S&P 100 results | IR AI Readiness Scanner",
  description: "Scanner results for the 100 largest companies in the S&P 500 (by market cap).",
};

function scoreColorClass(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 41) return "text-amber-400";
  return "text-red-400";
}

function ScoreCell({
  value,
  highlight,
}: {
  value: number | null | undefined;
  highlight?: boolean;
}) {
  const base = "px-3 py-2 text-center tabular-nums";
  const highlightClass = highlight ? "bg-emerald-500/10 border-x border-[var(--card-border)]" : "";
  if (value == null)
    return <td className={`${base} text-zinc-500 ${highlightClass}`}>—</td>;
  return (
    <td className={`${base} font-medium ${scoreColorClass(value)} ${highlightClass}`}>
      {value}
    </td>
  );
}

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
        <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
          <table className="w-full text-sm border-collapse">
            <caption className="sr-only">
              S&P 100 companies with IR domain and category scores (crawlability, structured data, parseability, freshness, IR checklist)
            </caption>
            <thead>
              <tr className="bg-[var(--card)]/80 border-b border-[var(--card-border)]">
                <th className="px-3 py-3 text-left font-semibold text-[var(--foreground)]">Company</th>
                <th className="px-3 py-3 text-left font-semibold text-[var(--foreground)]">Ticker</th>
                <th className="px-3 py-3 text-left font-semibold text-[var(--foreground)]">IR domain</th>
                <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)] bg-emerald-500/10 border-x border-[var(--card-border)]">Overall</th>
                <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]">Crawl</th>
                <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]">Struct</th>
                <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]">Parse</th>
                <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]">Fresh</th>
                <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]">IR list</th>
                <th className="px-3 py-3 text-left font-semibold text-[var(--foreground)]">Action</th>
              </tr>
            </thead>
            <tbody>
              {SP100_RESULTS.map((row: SP100Row, i: number) => (
                <tr
                  key={`${row.ticker}-${i}`}
                  className="border-b border-[var(--card-border)]/70 hover:bg-[var(--card)]/30"
                >
                  <td className="px-3 py-2 font-medium text-[var(--foreground)]">{row.companyName}</td>
                  <td className="px-3 py-2 text-zinc-400">{row.ticker}</td>
                  <td className="px-3 py-2 text-zinc-300">
                    {row.domain ? (
                      <span className="font-mono text-xs">{row.domain}</span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                  <ScoreCell value={row.overallScore ?? undefined} highlight />
                  <ScoreCell value={row.categoryScores?.crawlability} />
                  <ScoreCell value={row.categoryScores?.structuredData} />
                  <ScoreCell value={row.categoryScores?.parseability} />
                  <ScoreCell value={row.categoryScores?.freshness} />
                  <ScoreCell value={row.categoryScores?.irChecklist} />
                  <td className="px-3 py-2">
                    {row.domain ? (
                      <Link
                        href={`/?domainA=${encodeURIComponent(
                          row.domain.startsWith("http") ? row.domain : `https://${row.domain}`
                        )}`}
                        className="text-emerald-400 hover:text-emerald-300 underline text-xs"
                      >
                        Scan
                      </Link>
                    ) : (
                      <span className="text-zinc-500 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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

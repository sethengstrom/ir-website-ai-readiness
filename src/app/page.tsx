"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import type { DomainResult, Finding, StructuredDataBreakdown } from "@/lib/types";
import { AEO_INTRO, CATEGORY_CONTEXT, getFindingWhyItMatters } from "@/lib/aeo-context";

async function runScan(domainA: string, domainB: string): Promise<{
  runId: string;
  resultA: DomainResult;
  resultB: DomainResult;
  cached?: boolean;
  cachedAt?: string;
}> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domainA: domainA.trim(), domainB: domainB.trim() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Scan failed: ${res.status}`);
  }
  return res.json();
}

const CATEGORY_ITEMS = [
  { key: "crawlability", label: "Crawlability" },
  { key: "structuredData", label: "Structured data" },
  { key: "parseability", label: "Parseability" },
  { key: "freshness", label: "Freshness" },
  { key: "irChecklist", label: "IR checklist" },
] as const;

const PRESET_IR_SITES: { name: string; url: string }[] = [
  { name: "Alphabet", url: "https://abc.xyz/investor/" },
  { name: "Netflix", url: "https://ir.netflix.net" },
  { name: "Tesla", url: "https://ir.tesla.com" },
  { name: "NVIDIA", url: "https://investor.nvidia.com" },
  { name: "Visa", url: "https://investor.visa.com" },
  { name: "Chase", url: "https://www.jpmorganchase.com/ir" },
  { name: "Workday", url: "https://workday.com" },
  { name: "Tetra Tech", url: "https://investor.tetratech.com/overview/default.aspx" },
  { name: "Emera", url: "https://investors.emera.com/overview/default.aspx" },
];

function scoreColorClass(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 41) return "text-amber-400";
  return "text-red-400";
}

function CategoryRows({
  resultA,
  resultB,
  scoreColorClass,
}: {
  resultA: DomainResult;
  resultB: DomainResult;
  scoreColorClass: (n: number) => string;
}) {
  const [openImprovements, setOpenImprovements] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    setOpenImprovements((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  return (
    <div className="divide-y divide-zinc-700/50">
      {CATEGORY_ITEMS.map(({ key, label }) => {
        const ctx = CATEGORY_CONTEXT[key];
        if (!ctx) return null;
        // Structured data row shows JSON-LD-only score (breakdown); others use category score
        const scoreA =
          key === "structuredData" && resultA.structuredDataBreakdown != null
            ? resultA.structuredDataBreakdown.structuredDataScore
            : (resultA.categoryScores[key] ?? 0);
        const scoreB =
          key === "structuredData" && resultB.structuredDataBreakdown != null
            ? resultB.structuredDataBreakdown.structuredDataScore
            : (resultB.categoryScores[key] ?? 0);
        const hasImprovements = (ctx.improvements?.length ?? 0) > 0;
        const isOpen = openImprovements.has(key);
        return (
          <div
            key={key}
            className="grid grid-cols-[3rem_1fr_3rem] gap-3 md:gap-4 px-4 py-3 md:py-2.5 items-start"
          >
            <span className={`text-2xl font-bold tabular-nums text-right shrink-0 pt-0.5 ${scoreColorClass(scoreA)}`}>
              {scoreA}
            </span>
            <div className="min-w-0">
              <h3 className="font-medium text-white text-sm mb-1">{label}</h3>
              <p className="text-xs text-zinc-400 leading-snug">
                {ctx.what} {ctx.why}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                <span className="font-medium text-zinc-500">Score:</span> {ctx.scoreMeaning}
              </p>
              {key === "structuredData" && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  <span className="font-medium text-zinc-500">This row:</span> Structured Data Score (JSON-LD only). Overall AI Readiness above uses category score that includes feeds.
                </p>
              )}
              {hasImprovements && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-400 flex items-center gap-1 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span className="text-zinc-500" aria-hidden>{isOpen ? "▼" : "▶"}</span>
                    How to improve
                  </button>
                  {isOpen && (
                    <ul className="text-xs text-zinc-400 space-y-0.5 list-disc list-inside mt-1">
                      {ctx.improvements!.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <span className={`text-2xl font-bold tabular-nums text-left shrink-0 pt-0.5 ${scoreColorClass(scoreB)}`}>
              {scoreB}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ResultsByCategory({
  resultA,
  resultB,
}: {
  resultA: DomainResult;
  resultB: DomainResult;
}) {
  return (
    <section className="rounded-xl border border-zinc-700/60 bg-zinc-900/40 overflow-hidden">
      {/* Overall strip - compact, scores aligned */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 p-4 border-b border-zinc-700/60 bg-zinc-800/30 items-center">
        <div className="flex items-center gap-2 min-w-0">
          {resultA.faviconUrl && (
            <img
              src={resultA.faviconUrl}
              alt=""
              className="h-7 w-7 shrink-0 rounded object-contain bg-white/10"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <div className="min-w-0">
            <span className="text-sm font-medium text-white truncate block" title={resultA.domain}>
              {resultA.domain}
            </span>
            <span className="text-xs text-zinc-500">
              overall · {resultA.crawledPageCount} pages
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 min-w-[7rem]">
          <span className="text-xs text-zinc-500 font-medium">Overall AI Readiness Score</span>
          <div className="flex items-center gap-6">
            <span className={`text-5xl font-bold tabular-nums w-14 text-right ${scoreColorClass(resultA.overallScore)}`}>
              {resultA.overallScore}
            </span>
            <span className="text-zinc-500 text-sm font-medium shrink-0">vs</span>
            <span className={`text-5xl font-bold tabular-nums w-14 text-left ${scoreColorClass(resultB.overallScore)}`}>
              {resultB.overallScore}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          {resultB.faviconUrl && (
            <img
              src={resultB.faviconUrl}
              alt=""
              className="h-7 w-7 shrink-0 rounded object-contain bg-white/10"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <div className="min-w-0 text-right">
            <span className="text-sm font-medium text-white truncate block" title={resultB.domain}>
              {resultB.domain}
            </span>
            <span className="text-xs text-zinc-500">
              overall · {resultB.crawledPageCount} pages
            </span>
          </div>
        </div>
      </div>

      {/* Category rows: Score A | Description | Score B - scores aligned in fixed columns */}
      <CategoryRows
        resultA={resultA}
        resultB={resultB}
        scoreColorClass={scoreColorClass}
      />
    </section>
  );
}

function StructuredDataBreakdownCard({
  breakdown,
  domainLabel,
}: {
  breakdown: StructuredDataBreakdown | undefined;
  domainLabel: string;
}) {
  if (!breakdown) {
    return (
      <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/30 p-4">
        <h4 className="font-medium text-white text-sm mb-2">{domainLabel}</h4>
        <p className="text-xs text-zinc-500">No structured data breakdown.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/30 p-4">
      <h4 className="font-medium text-white text-sm mb-2">{domainLabel}</h4>
      <p className="text-xs text-zinc-500 mb-2">
        <span className="font-medium text-zinc-400">JSON-LD blocks:</span> {breakdown.jsonLdBlockCount}
      </p>
      {breakdown.detectedTypes.length > 0 ? (
        <p className="text-xs text-zinc-500 mb-2">
          <span className="font-medium text-zinc-400">Detected @type:</span>{" "}
          <span className="text-zinc-300">{breakdown.detectedTypes.join(", ")}</span>
        </p>
      ) : (
        <p className="text-xs text-zinc-500 mb-2">No schema types detected.</p>
      )}
      {breakdown.missingRecommendedTypes.length > 0 ? (
        <p className="text-xs text-zinc-500">
          <span className="font-medium text-amber-500/90">Missing recommended:</span>{" "}
          <span className="text-zinc-400">{breakdown.missingRecommendedTypes.join(", ")}</span>
        </p>
      ) : (
        <p className="text-xs text-emerald-500/90">All recommended IR schema types present.</p>
      )}
    </div>
  );
}

function FindingsTable({ findings, domainLabel }: { findings: Finding[]; domainLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const [openWhyRow, setOpenWhyRow] = useState<number | null>(null);
  const show = expanded ? findings : findings.slice(0, 12);
  return (
    <div className="border border-zinc-700/60 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-zinc-800/80 border-b border-zinc-700/60 font-medium text-sm">
        Findings — {domainLabel}
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-800/95 text-zinc-400 text-left">
            <tr>
              <th className="px-4 py-2 w-8">✓</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Signal</th>
              <th className="px-4 py-2 w-14">Score</th>
              <th className="px-4 py-2">Evidence</th>
              <th className="px-4 py-2 w-16">Why it matters</th>
            </tr>
          </thead>
          <tbody>
            {show.map((f, i) => (
              <Fragment key={i}>
                <tr
                  className="border-t border-zinc-700/40 hover:bg-zinc-800/40"
                >
                  <td className="px-4 py-2">
                    {f.passed ? (
                      <span className="text-emerald-500">✓</span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">
                    {f.subcategory ? `${f.category} › ${f.subcategory}` : f.category}
                  </td>
                  <td className="px-4 py-2 text-zinc-200">{f.signal}</td>
                  <td className={`px-4 py-2 tabular-nums font-medium ${scoreColorClass(f.score)}`}>{f.score}</td>
                  <td className="px-4 py-2 text-zinc-400 max-w-[200px] truncate" title={[f.evidence.url, f.evidence.snippet].filter(Boolean).join(" ")}>
                    {f.evidence.url ? (
                      <a
                        href={f.evidence.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400/80 hover:underline truncate block"
                      >
                        {f.evidence.url}
                      </a>
                    ) : (
                      f.evidence.snippet ?? f.evidence.method
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setOpenWhyRow(openWhyRow === i ? null : i)}
                      className="text-xs text-emerald-400/90 hover:text-emerald-300 underline focus:outline-none focus:ring-0"
                    >
                      {openWhyRow === i ? "Hide" : "Why?"}
                    </button>
                  </td>
                </tr>
                {openWhyRow === i && (
                  <tr className="border-t border-zinc-700/30 bg-zinc-800/50">
                    <td colSpan={6} className="px-4 py-3 text-zinc-400 text-xs leading-relaxed">
                      <span className="text-zinc-500 font-medium">Why it matters for AEO: </span>
                      {getFindingWhyItMatters(f.category, f.subcategory)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {findings.length > 12 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2 text-sm text-zinc-400 hover:text-zinc-200 border-t border-zinc-700/60"
        >
          {expanded ? "Show less" : `Show all ${findings.length} findings`}
        </button>
      )}
    </div>
  );
}

export default function Home() {
  const [domainA, setDomainA] = useState("https://investor.ciena.com/");
  const [domainB, setDomainB] = useState("https://investor.workday.com");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    resultA: DomainResult;
    resultB: DomainResult;
    cached?: boolean;
    cachedAt?: string;
  } | null>(null);

  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatusMessage, setScanStatusMessage] = useState("");
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SCAN_STATUS_MESSAGES = [
    "Checking robots.txt & sitemaps…",
    "Crawling Domain A…",
    "Crawling Domain B…",
    "Analyzing crawlability & structure…",
    "Analyzing content & IR checklist…",
    "Almost there…",
  ];

  useEffect(() => {
    if (!loading) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      return;
    }
    setScanProgress(0);
    setScanStatusMessage(SCAN_STATUS_MESSAGES[0]);
    let statusIndex = 0;
    statusIntervalRef.current = setInterval(() => {
      statusIndex = (statusIndex + 1) % SCAN_STATUS_MESSAGES.length;
      setScanStatusMessage(SCAN_STATUS_MESSAGES[statusIndex]);
    }, 4500);
    progressIntervalRef.current = setInterval(() => {
      setScanProgress((p) => (p >= 90 ? 90 : p + 6));
    }, 2500);
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!domainA.trim() || !domainB.trim()) {
      setError("Enter both Domain A and Domain B.");
      return;
    }
    setLoading(true);
    try {
      const data = await runScan(domainA, domainB);
      setResult({
        resultA: data.resultA,
        resultB: data.resultB,
        cached: data.cached,
        cachedAt: data.cachedAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanProgress(100);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f12] text-zinc-200">
      <header className="border-b border-zinc-800 px-4 py-6">
        <h1 className="text-2xl font-bold text-white">IR AI Readiness Scanner</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Compare two domains for investor relations AI/agent retrieval signals
        </p>
        <div className="mt-4 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-sm">
          <h2 className="font-semibold text-zinc-200 mb-1">{AEO_INTRO.title}</h2>
          <p className="text-zinc-400 mb-2">{AEO_INTRO.body}</p>
          <p className="text-zinc-500 text-xs">{AEO_INTRO.scoreMeaning}</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end mb-8">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-zinc-400 mb-1">Domain A</label>
            <input
              type="text"
              placeholder="example.com or https://example.com"
              value={domainA}
              onChange={(e) => setDomainA(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              disabled={loading}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRESET_IR_SITES.slice(0, 6).map(({ name, url }) => (
                <button
                  key={`a-${name}`}
                  type="button"
                  onClick={() => setDomainA(url)}
                  disabled={loading}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-50 transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 self-center"
          >
            {loading ? "Scanning…" : "Compare"}
          </button>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-zinc-400 mb-1">Domain B</label>
            <input
              type="text"
              placeholder="example.com or https://example.com"
              value={domainB}
              onChange={(e) => setDomainB(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              disabled={loading}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRESET_IR_SITES.slice(6, 9).map(({ name, url }) => (
                <button
                  key={`b-${name}`}
                  type="button"
                  onClick={() => setDomainB(url)}
                  disabled={loading}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-50 transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </form>

        {loading && (
          <div className="mb-6 p-4 rounded-lg bg-zinc-800/60 border border-zinc-700/60 text-zinc-300">
            <p className="font-medium text-zinc-200 mb-2">{scanStatusMessage}</p>
            <div className="h-2 rounded-full bg-zinc-700 overflow-hidden mb-3">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
            <p className="text-sm text-zinc-500">
              This usually takes <strong className="text-zinc-400">under 30 seconds</strong>. We fetch the homepage, key IR paths, robots.txt, and sitemap, then analyze each site. Please don’t close this page.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-200">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-8">
            {result.cached && result.cachedAt && (
              <div className="p-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50 text-zinc-500 text-sm">
                Showing cached results from{" "}
                {(() => {
                  try {
                    const d = new Date(result.cachedAt);
                    if (Number.isNaN(d.getTime())) return String(result.cachedAt);
                    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
                  } catch {
                    return String(result.cachedAt);
                  }
                })()}
                . No new scan was run.
              </div>
            )}
            <ResultsByCategory resultA={result.resultA} resultB={result.resultB} />

            <section className="px-4 py-3 border-t border-zinc-700/60">
              <h3 className="font-medium text-white text-sm mb-3">Structured data breakdown (JSON-LD only)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StructuredDataBreakdownCard
                  breakdown={result.resultA.structuredDataBreakdown}
                  domainLabel={result.resultA.domain}
                />
                <StructuredDataBreakdownCard
                  breakdown={result.resultB.structuredDataBreakdown}
                  domainLabel={result.resultB.domain}
                />
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FindingsTable
                findings={result.resultA.findings}
                domainLabel={result.resultA.domain}
              />
              <FindingsTable
                findings={result.resultB.findings}
                domainLabel={result.resultB.domain}
              />
            </section>
          </div>
        )}

        {!result && !loading && (
          <p className="text-zinc-500 text-sm">
            Enter two domains and click Compare. Each site is checked by fetching the homepage,
            IR paths (/investor, /ir), robots.txt, and sitemap (no deep crawl), then analyzed for
            crawlability, structured data, parseability, freshness, and IR completeness. Results are
            stored in the database.
          </p>
        )}
      </main>
    </div>
  );
}

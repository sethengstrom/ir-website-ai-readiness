"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Fragment, Suspense } from "react";
import type {
  DomainResult,
  Finding,
  StructuredDataBreakdown,
  InvestorQuestionResult,
  InvestorQuestionStatus,
} from "@/lib/types";
import { AEO_INTRO, CATEGORY_CONTEXT, getFindingWhyItMatters, getCategoryFindingsForDomain } from "@/lib/aeo-context";
import { messageForCode, isScanErrorCode, SCAN_ERROR_CODES } from "@/lib/scan-errors";
import { downloadResultsPdf } from "@/lib/download-report-pdf";
import { APP_VERSION } from "@/lib/version";

type ScanProgressEvent = { phase: string; message: string; progress: number };

async function runScan(
  domainA: string,
  domainB: string,
  onProgress?: (event: ScanProgressEvent) => void
): Promise<{
  runId: string;
  resultA: DomainResult;
  resultB: DomainResult | null;
  cached?: boolean;
  cachedAt?: string;
}> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      domainA: domainA.trim(),
      ...(domainB.trim() ? { domainB: domainB.trim() } : {}),
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data.error || `Scan failed: ${res.status}`;
    const code = data.code;
    const err = new Error(msg) as Error & { code?: string };
    if (code && isScanErrorCode(code)) err.code = code;
    throw err;
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/x-ndjson")) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");
    const dec = new TextDecoder();
    let buffer = "";
    let donePayload: {
      runId: string;
      resultA: DomainResult;
      resultB: DomainResult | null;
      cached?: boolean;
      cachedAt?: string;
    } | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line) as Record<string, unknown>;
          if (data.type === "progress" && typeof data.message === "string" && typeof data.progress === "number") {
            onProgress?.({ phase: String(data.phase ?? ""), message: data.message, progress: data.progress });
          } else if (data.type === "done") {
            donePayload = {
              runId: String(data.runId ?? ""),
              resultA: data.resultA as DomainResult,
              resultB: data.resultB != null ? (data.resultB as DomainResult) : null,
              cached: data.cached === true,
              cachedAt: typeof data.cachedAt === "string" ? data.cachedAt : undefined,
            };
          } else if (data.type === "error") {
            const code = data.code as string | undefined;
            const message = (data.message as string) || "Scan failed";
            const err = new Error(message) as Error & { code?: string };
            if (code && isScanErrorCode(code)) err.code = code;
            throw err;
          }
        } catch (e) {
          const err = e as Error & { code?: string };
          if (err instanceof Error && err.message !== "Scan failed" && !err.code) throw new Error("Invalid stream");
          throw e;
        }
      }
    }
    if (!donePayload) throw new Error("Scan failed");
    return donePayload;
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

const PRESET_IR_SITES_A = [
  { name: "Alphabet", url: "https://abc.xyz/investor/" },
  { name: "Netflix", url: "https://ir.netflix.net" },
  { name: "Tesla", url: "https://ir.tesla.com" },
  { name: "NVIDIA", url: "https://investor.nvidia.com" },
] as const;
const PRESET_IR_SITES_B = [
  { name: "Workday", url: "https://investor.workday.com/" },
  { name: "Tetra Tech", url: "https://investor.tetratech.com/overview/default.aspx" },
  { name: "Emera", url: "https://investors.emera.com/overview/default.aspx" },
] as const;

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
  resultB: DomainResult | null;
  scoreColorClass: (n: number) => string;
}) {
  const singleDomain = resultB == null;
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
        const scoreA = resultA.categoryScores[key] ?? 0;
        const scoreB = resultB?.categoryScores[key] ?? 0;
        const criteriaA = getCategoryFindingsForDomain(key, resultA.findings ?? []);
        const criteriaB = resultB ? getCategoryFindingsForDomain(key, resultB.findings ?? []) : [];
        const hasCriteria = criteriaA.length > 0 || criteriaB.length > 0;
        const isOpen = openImprovements.has(key);
        return (
          <div
            key={key}
            className={`grid gap-3 md:gap-4 px-4 py-3 md:py-2.5 items-start ${singleDomain ? "grid-cols-[3rem_1fr]" : "grid-cols-[3rem_1fr_3rem]"}`}
          >
            <span className={`text-2xl font-bold tabular-nums text-right shrink-0 pt-0.5 ${scoreColorClass(scoreA)}`}>
              {scoreA}
            </span>
            <div className="min-w-0">
              <h3 className="font-medium text-white text-sm mb-1">{label}</h3>
              <p className="text-sm text-zinc-400 leading-snug">
                {ctx.what} {ctx.why}
              </p>
              <p className="text-sm text-zinc-500 mt-0.5">
                <span className="font-medium text-zinc-500">Score:</span> {ctx.scoreMeaning}
              </p>
              {key === "structuredData" && (
                <p className="text-sm text-zinc-500 mt-0.5">
                  <span className="font-medium text-zinc-500">This row:</span> Category score (includes feeds).
                  {singleDomain
                    ? ` JSON-LD only: ${resultA.structuredDataBreakdown?.structuredDataScore ?? "—"}`
                    : ` JSON-LD only: ${resultA.structuredDataBreakdown?.structuredDataScore ?? "—"} / ${resultB!.structuredDataBreakdown?.structuredDataScore ?? "—"}`}
                </p>
              )}
              {hasCriteria && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="text-sm font-medium text-zinc-500 hover:text-zinc-400 flex items-center gap-1 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span className="text-zinc-500" aria-hidden>{isOpen ? "▼" : "▶"}</span>
                    {singleDomain ? "Criteria (pass / fail)" : "Criteria (pass / fail by domain)"}
                  </button>
                  {isOpen && (
                    <div className={singleDomain ? "mt-1" : "mt-1 grid grid-cols-2 gap-4"}>
                      <div>
                        {!singleDomain && <p className="text-sm font-medium text-zinc-500 mb-0.5">Domain A</p>}
                        <ul className="text-sm text-zinc-400 space-y-1 list-none">
                          {criteriaA.map(({ label: l, passed, improvement }, i) => (
                            <li key={i} className="flex gap-1.5 items-start">
                              <span className="shrink-0 mt-0.5" aria-hidden>
                                {passed ? (
                                  <span className="text-emerald-400" title="Passed">✓</span>
                                ) : (
                                  <span className="text-red-400" title="Failed">✗</span>
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className={passed ? undefined : "text-zinc-300"}>{l}</span>
                                {!passed && improvement && (
                                  <span className="block text-zinc-500 mt-0.5 italic">How to improve: {improvement}</span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {!singleDomain && (
                        <div>
                          <p className="text-sm font-medium text-zinc-500 mb-0.5">Domain B</p>
                        <ul className="text-sm text-zinc-400 space-y-1 list-none">
                            {criteriaB.map(({ label: l, passed, improvement }, i) => (
                              <li key={i} className="flex gap-1.5 items-start">
                                <span className="shrink-0 mt-0.5" aria-hidden>
                                  {passed ? (
                                    <span className="text-emerald-400" title="Passed">✓</span>
                                  ) : (
                                    <span className="text-red-400" title="Failed">✗</span>
                                  )}
                                </span>
                                <span className="min-w-0">
                                  <span className={passed ? undefined : "text-zinc-300"}>{l}</span>
                                  {!passed && improvement && (
                                    <span className="block text-zinc-500 mt-0.5 italic">How to improve: {improvement}</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {!singleDomain && (
              <span className={`text-2xl font-bold tabular-nums text-left shrink-0 pt-0.5 ${scoreColorClass(scoreB)}`}>
                {scoreB}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResultsByCategory({
  resultA,
  resultB,
  stickyHeader,
}: {
  resultA: DomainResult;
  resultB: DomainResult | null;
  stickyHeader?: React.ReactNode;
}) {
  const singleDomain = resultB == null;
  const strip = (
    <div className={`grid gap-3 md:gap-4 p-4 border-b border-zinc-700/60 bg-zinc-800/30 items-center ${singleDomain ? "grid-cols-1" : "grid-cols-2 md:grid-cols-[1fr_auto_1fr]"}`}>
      <div className="flex items-center gap-2 min-w-0 order-2 md:order-1">
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
          <span className="text-sm text-zinc-500">
            overall · {resultA.crawledPageCount} pages
          </span>
        </div>
      </div>
      <div className={`flex flex-col items-center gap-1 min-w-0 ${singleDomain ? "" : "col-span-2 md:col-span-1"} md:min-w-[7rem] order-1 md:order-2`}>
        <span className="text-sm text-zinc-500 font-medium">
            Overall readiness
          </span>
        <div className="flex items-center gap-4 md:gap-6">
          <span className={`text-4xl md:text-5xl font-bold tabular-nums ${singleDomain ? "" : "text-right"} ${scoreColorClass(resultA.overallScore)}`}>
            {resultA.overallScore}
          </span>
          {!singleDomain && (
            <>
              <span className="text-zinc-500 text-sm font-medium shrink-0">vs</span>
              <span className={`text-4xl md:text-5xl font-bold tabular-nums text-left ${scoreColorClass(resultB!.overallScore)}`}>
                {resultB!.overallScore}
              </span>
            </>
          )}
        </div>
        <span className="text-sm text-zinc-500">
          AI Citation: {resultA.aiCitationReadiness ?? "—"}
          {!singleDomain && ` vs ${resultB!.aiCitationReadiness ?? "—"}`}
        </span>
      </div>
      {!singleDomain && (
        <div className="flex items-center gap-2 min-w-0 justify-end order-3 md:order-3">
          {resultB!.faviconUrl && (
            <img
              src={resultB!.faviconUrl}
              alt=""
              className="h-7 w-7 shrink-0 rounded object-contain bg-white/10"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <div className="min-w-0 text-right">
            <span className="text-sm font-medium text-white truncate block" title={resultB!.domain}>
              {resultB!.domain}
            </span>
            <span className="text-sm text-zinc-500">
              overall · {resultB!.crawledPageCount} pages
            </span>
          </div>
        </div>
      )}
    </div>
  );
  return (
    <section className="rounded-xl border border-zinc-700/60 bg-zinc-900/40 overflow-hidden">
      <div className="sticky top-0 z-10 bg-[var(--background)] border-b border-zinc-700/60 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3)]">
        {strip}
        {stickyHeader && <div className="px-4 pb-3 flex flex-wrap items-center gap-3">{stickyHeader}</div>}
      </div>

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
        <p className="text-sm text-zinc-500">No structured data breakdown.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/30 p-4">
      <h4 className="font-medium text-white text-sm mb-2">{domainLabel}</h4>
      <p className="text-sm text-zinc-500 mb-2">
        <span className="font-medium text-zinc-400">JSON-LD blocks:</span> {breakdown.jsonLdBlockCount}
      </p>
      {breakdown.detectedTypes.length > 0 ? (
        <p className="text-sm text-zinc-500 mb-2">
          <span className="font-medium text-zinc-400">Detected @type:</span>{" "}
          <span className="text-zinc-300">{breakdown.detectedTypes.join(", ")}</span>
        </p>
      ) : (
        <p className="text-sm text-zinc-500 mb-2">No schema types detected.</p>
      )}
      {breakdown.missingRecommendedTypes.length > 0 ? (
        <p className="text-sm text-zinc-500">
          <span className="font-medium text-amber-500/90">Missing recommended:</span>{" "}
          <span className="text-zinc-400">{breakdown.missingRecommendedTypes.join(", ")}</span>
        </p>
      ) : (
        <p className="text-sm text-emerald-500/90">All recommended IR schema types present.</p>
      )}
    </div>
  );
}

function statusLabel(s: InvestorQuestionStatus): string {
  switch (s) {
    case "answerable":
      return "✓ Answerable";
    case "partial":
      return "◐ Partial";
    default:
      return "— Not";
  }
}

function statusColorClass(s: InvestorQuestionStatus): string {
  switch (s) {
    case "answerable":
      return "text-emerald-400";
    case "partial":
      return "text-amber-400";
    default:
      return "text-zinc-500";
  }
}

function InvestorQuestionTable({
  resultsA,
  resultsB,
  domainLabelA,
  domainLabelB,
}: {
  resultsA: InvestorQuestionResult[];
  resultsB: InvestorQuestionResult[] | null;
  domainLabelA: string;
  domainLabelB: string | null;
}) {
  const singleDomain = resultsB == null;
  const rows = singleDomain ? resultsA : (resultsA.length >= resultsB!.length ? resultsA : resultsB!);
  const getB = (id: string) => (singleDomain ? null : resultsB!.find((r) => r.id === id));
  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-700/60 bg-zinc-800/30">
        <h3 className="font-medium text-white text-sm">Investor question coverage (AI answerability)</h3>
        <p className="text-sm text-zinc-500 mt-0.5">
          Pass/fail per question with evidence and source URL. ✓ Answerable, ◐ Partial, — Not answerable.
        </p>
      </div>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className={`w-full text-sm ${singleDomain ? "min-w-0" : "min-w-[640px]"}`} aria-label="Investor question coverage: status and evidence per question">
          <caption className="sr-only">
            Investor question coverage (AI answerability): pass/fail per question with evidence and source URL
          </caption>
          <thead className="sticky top-0 bg-zinc-800/95 text-zinc-400 text-left z-10">
            {singleDomain ? (
              <tr>
                <th scope="col" className="w-8 bg-zinc-800/95 px-4 py-2">#</th>
                <th scope="col" className="min-w-[180px] bg-zinc-800/95 px-4 py-2">Question</th>
                <th scope="col" className="px-4 py-2 font-semibold text-white bg-emerald-900/30 border-l border-zinc-600/60 w-28">Status</th>
                <th scope="col" className="px-4 py-2 font-semibold text-white bg-emerald-900/30 min-w-[140px]">Evidence / URL</th>
              </tr>
            ) : (
              <>
                <tr>
                  <th scope="col" className="sticky left-0 z-20 w-8 bg-zinc-800/95 px-4 py-2" rowSpan={2}>#</th>
                  <th scope="col" className="sticky left-[4rem] z-20 min-w-[180px] bg-zinc-800/95 px-4 py-2 shadow-[2px_0_4px_rgba(0,0,0,0.15)]" rowSpan={2}>Question</th>
                  <th scope="col" colSpan={2} className="px-4 py-2 text-center font-semibold text-white bg-emerald-900/30 border-l border-zinc-600/60">
                    {domainLabelA}
                  </th>
                  <th scope="col" colSpan={2} className="px-4 py-2 text-center font-semibold text-white bg-amber-900/20 border-l-2 border-zinc-600">
                    {domainLabelB!}
                  </th>
                </tr>
                <tr>
                  <th scope="col" className="px-4 py-1.5 w-28 border-l border-zinc-600/60 bg-emerald-900/20">Status</th>
                  <th scope="col" className="px-4 py-1.5 min-w-[140px] bg-emerald-900/20">Evidence / URL</th>
                  <th scope="col" className="px-4 py-1.5 w-28 border-l-2 border-zinc-600 bg-amber-900/15">Status</th>
                  <th scope="col" className="px-4 py-1.5 min-w-[140px] bg-amber-900/15">Evidence / URL</th>
                </tr>
              </>
            )}
          </thead>
          <tbody>
            {singleDomain ? (
              rows.map((ra, i) => (
                  <tr key={ra.id} className="group border-t border-zinc-700/40 hover:bg-zinc-800/40">
                    <td className="w-8 px-4 py-2 text-zinc-500 tabular-nums">{i + 1}</td>
                    <td className="min-w-[180px] px-4 py-2 text-zinc-300">{ra.question}</td>
                    <td className={`px-4 py-2 font-medium border-l border-zinc-700/60 bg-emerald-950/20 ${statusColorClass(ra.status)}`}>{statusLabel(ra.status)}</td>
                    <td className="px-4 py-2 text-zinc-400 text-sm bg-emerald-950/20">
                      {ra.pageType && <span className="block text-xs text-zinc-500 uppercase tracking-wide mb-0.5">{ra.pageType}</span>}
                      {ra.evidenceSnippet && <span className="block truncate max-w-[200px]" title={ra.evidenceSnippet}>{ra.evidenceSnippet}</span>}
                      {ra.sourceUrl && (
                        <a href={ra.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400/80 hover:underline truncate block max-w-[200px]">
                          {ra.sourceUrl}
                        </a>
                      )}
                      {!ra.evidenceSnippet && !ra.sourceUrl && ra.explanation && <span className="text-zinc-500">{ra.explanation}</span>}
                    </td>
                  </tr>
                ))
            ) : (
              rows.map((ra, i) => {
                const rb = getB(ra.id);
                return (
                  <tr key={ra.id} className="group border-t border-zinc-700/40 hover:bg-zinc-800/40">
                    <td className="sticky left-0 z-10 w-8 bg-zinc-900/40 group-hover:bg-zinc-800/40 px-4 py-2 text-zinc-500 tabular-nums">{i + 1}</td>
                    <td className="sticky left-[4rem] z-10 min-w-[180px] bg-zinc-900/40 group-hover:bg-zinc-800/40 px-4 py-2 text-zinc-300 shadow-[2px_0_4px_rgba(0,0,0,0.15)]">{ra.question}</td>
                    <td className={`px-4 py-2 font-medium border-l border-zinc-700/60 bg-emerald-950/20 ${statusColorClass(ra.status)}`}>{statusLabel(ra.status)}</td>
                    <td className="px-4 py-2 text-zinc-400 text-sm bg-emerald-950/20">
                      {ra.pageType && <span className="block text-xs text-zinc-500 uppercase tracking-wide mb-0.5">{ra.pageType}</span>}
                      {ra.evidenceSnippet && <span className="block truncate max-w-[200px]" title={ra.evidenceSnippet}>{ra.evidenceSnippet}</span>}
                      {ra.sourceUrl && (
                        <a href={ra.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400/80 hover:underline truncate block max-w-[200px]">
                          {ra.sourceUrl}
                        </a>
                      )}
                      {!ra.evidenceSnippet && !ra.sourceUrl && ra.explanation && <span className="text-zinc-500">{ra.explanation}</span>}
                    </td>
                    <td className={`px-4 py-2 font-medium border-l-2 border-zinc-600 bg-amber-950/10 ${rb ? statusColorClass(rb.status) : "text-zinc-500"}`}>
                      {rb ? statusLabel(rb.status) : "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-400 text-sm bg-amber-950/10">
                      {rb?.pageType && <span className="block text-xs text-zinc-500 uppercase tracking-wide mb-0.5">{rb.pageType}</span>}
                      {rb?.evidenceSnippet && <span className="block truncate max-w-[200px]" title={rb.evidenceSnippet}>{rb.evidenceSnippet}</span>}
                      {rb?.sourceUrl && (
                        <a href={rb.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400/80 hover:underline truncate block max-w-[200px]">
                          {rb.sourceUrl}
                        </a>
                      )}
                      {rb && !rb.evidenceSnippet && !rb.sourceUrl && rb.explanation && <span className="text-zinc-500">{rb.explanation}</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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
        <table className="w-full text-sm" aria-label={`Findings for ${domainLabel}`}>
          <caption className="sr-only">Findings: category, signal, score, evidence, and why it matters for AEO</caption>
          <thead className="sticky top-0 bg-zinc-800/95 text-zinc-400 text-left">
            <tr>
              <th scope="col" className="px-4 py-2 w-8">✓</th>
              <th scope="col" className="px-4 py-2">Category</th>
              <th scope="col" className="px-4 py-2">Signal</th>
              <th scope="col" className="px-4 py-2 w-14">Score</th>
              <th scope="col" className="px-4 py-2">Evidence</th>
              <th scope="col" className="px-4 py-2 w-16">Why it matters</th>
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
                      className="text-sm text-emerald-400/90 hover:text-emerald-300 underline focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-zinc-900 rounded"
                      aria-expanded={openWhyRow === i}
                      aria-controls={openWhyRow === i ? `finding-why-${i}` : undefined}
                    >
                      {openWhyRow === i ? "Hide" : "Why?"}
                    </button>
                  </td>
                </tr>
                {openWhyRow === i && (
                  <tr id={`finding-why-${i}`} className="border-t border-zinc-700/30 bg-zinc-800/50" role="region" aria-label="Why it matters for AEO">
                    <td colSpan={6} className="px-4 py-3 text-zinc-400 text-sm leading-relaxed">
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

function HomeContent() {
  const searchParams = useSearchParams();
  const [domainA, setDomainA] = useState("");
  const [domainB, setDomainB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    resultA: DomainResult;
    resultB: DomainResult | null;
    cached?: boolean;
    cachedAt?: string;
  } | null>(null);

  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatusMessage, setScanStatusMessage] = useState("");
  const [retryBlockedUntil, setRetryBlockedUntil] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(0);

  // Auto-fill from URL: ?domainA=... and ?domainB=...
  useEffect(() => {
    const a = searchParams.get("domainA");
    const b = searchParams.get("domainB");
    if (a != null && String(a).trim() !== "") setDomainA(String(a).trim());
    if (b != null && String(b).trim() !== "") setDomainB(String(b).trim());
  }, [searchParams]);

  // Countdown for rate-limit retry
  useEffect(() => {
    if (retryBlockedUntil <= 0) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((retryBlockedUntil - Date.now()) / 1000));
      setRetryCountdown(left);
    }, 500);
    return () => clearInterval(id);
  }, [retryBlockedUntil]);

  const doScan = async (forceRefresh = false) => {
    setError(null);
    setLoading(true);
    setScanProgress(0);
    setScanStatusMessage("Starting scan…");
    try {
      const data = await runScan(domainA, domainB || "", (event) => {
        setScanStatusMessage(event.message);
        setScanProgress(event.progress);
      });
      setScanProgress(100);
      setScanStatusMessage("Done");
      setResult({
        resultA: data.resultA,
        resultB: data.resultB,
        cached: data.cached,
        cachedAt: data.cachedAt,
      });
    } catch (err) {
      const e = err as Error & { code?: string };
      let message: string;
      if (e?.code && isScanErrorCode(e.code)) {
        message = messageForCode(e.code);
        if (e.code === SCAN_ERROR_CODES.RATE_LIMIT_EXCEEDED) {
          const until = Date.now() + 60_000;
          setRetryBlockedUntil(until);
          setRetryCountdown(60);
        }
      } else if (e instanceof Error && (e.message === "Failed to fetch" || e.name === "TypeError")) {
        message = "Check your connection and try again.";
      } else {
        message = e instanceof Error ? e.message : "Scan failed";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    if (retryBlockedUntil > Date.now()) return;
    const delayMs = 1500;
    setScanStatusMessage("Retrying in a moment…");
    setTimeout(() => doScan(), delayMs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainA.trim()) {
      setError("Enter at least Domain A.");
      return;
    }
    setResult(null);
    await doScan();
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)] py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">IR AI Readiness Scanner</h1>
            <p className="text-[var(--muted)] text-sm mt-1">
              See how ready your IR site is for AI assistants to answer investor questions—and what to fix.
            </p>
          </div>
          <div className="mt-4 p-4 rounded-lg bg-[var(--card)]/50 border border-[var(--card-border)] text-sm">
            <h2 className="font-semibold text-[var(--foreground)] mb-1">{AEO_INTRO.title}</h2>
            <p className="text-[var(--muted)] mb-2">{AEO_INTRO.body}</p>
            <p className="text-[var(--muted)] text-sm opacity-90">{AEO_INTRO.scoreMeaning}</p>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 py-8" tabIndex={-1}>
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row md:flex-wrap gap-4 md:items-end mb-8">
          <div className="w-full md:flex-1 md:min-w-[200px] min-w-0">
            <label htmlFor="domain-a" className="block text-sm text-zinc-400 mb-1">Domain A</label>
            <input
              id="domain-a"
              type="text"
              placeholder="example.com or https://example.com"
              value={domainA}
              onChange={(e) => setDomainA(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              disabled={loading}
              autoComplete="url"
            />
            <div className="flex flex-wrap gap-1.5 mt-2 min-w-0">
              {PRESET_IR_SITES_A.map(({ name, url }) => (
                <button
                  key={`a-${name}`}
                  type="button"
                  onClick={() => setDomainA(url)}
                  disabled={loading}
                  className="px-2.5 py-1 rounded text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-50 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
                  aria-label={`Use ${name} as Domain A`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 md:self-center focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
          >
            {loading ? "Scanning…" : domainB.trim() ? "Compare" : "Scan"}
          </button>
          <div className="w-full md:flex-1 md:min-w-[200px] min-w-0">
            <label htmlFor="domain-b" className="block text-sm text-zinc-400 mb-1">Domain B (optional)</label>
            <input
              id="domain-b"
              type="text"
              placeholder="Leave empty to scan one domain"
              value={domainB}
              onChange={(e) => setDomainB(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              disabled={loading}
              autoComplete="url"
            />
            <div className="flex flex-wrap gap-1.5 mt-2 min-w-0">
              {PRESET_IR_SITES_B.map(({ name, url }) => (
                <button
                  key={`b-${name}`}
                  type="button"
                  onClick={() => setDomainB(url)}
                  disabled={loading}
                  className="px-2.5 py-1 rounded text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-50 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
                  aria-label={`Use ${name} as Domain B`}
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
              A deep scan can take <strong className="text-zinc-400">1–4 minutes</strong> (two domains take longer). We fetch the homepage, robots.txt, sitemap, discover and fetch up to 3 IR pages, and up to 14 earnings/events/presentations links per domain, then analyze each site. Please don’t close this page.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="min-w-0">{error}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setError(null)}
                className="px-3 py-1.5 rounded text-sm font-medium bg-red-900/50 hover:bg-red-900/70 text-red-100 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleRetry}
                disabled={retryBlockedUntil > Date.now()}
                className="px-3 py-1.5 rounded text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
              >
                {retryBlockedUntil > Date.now() && retryCountdown > 0
                  ? `Retry (in ${retryCountdown}s)`
                  : "Retry"}
              </button>
            </div>
          </div>
        )}

        {result && (
          <section className="space-y-8" aria-labelledby="scan-results-heading">
            <h2 id="scan-results-heading" className="sr-only">
              Scan results
            </h2>
            {result.cached && result.cachedAt && (
              <div className="p-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50 text-zinc-500 text-sm flex flex-wrap items-center justify-between gap-2">
                <span>
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
                </span>
                <button
                  type="button"
                  onClick={() => doScan()}
                  disabled={loading}
                  className="px-3 py-1.5 rounded text-sm font-medium bg-zinc-600 hover:bg-zinc-500 text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
                >
                  Run new scan
                </button>
              </div>
            )}
            <ResultsByCategory
              resultA={result.resultA}
              resultB={result.resultB}
              stickyHeader={
                <>
                  <button
                    type="button"
                    onClick={() => downloadResultsPdf(result.resultA, result.resultB)}
                    className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium border border-zinc-600 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
                    aria-label="Download results as PDF"
                  >
                    Download PDF
                  </button>
                </>
              }
            />

            <section className="px-4 py-3 border-t border-zinc-700/60">
              <h3 className="font-medium text-white text-sm mb-3">Structured data breakdown (JSON-LD only)</h3>
              <div className={`grid gap-4 ${result.resultB ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 max-w-md"}`}>
                <StructuredDataBreakdownCard
                  breakdown={result.resultA.structuredDataBreakdown}
                  domainLabel={result.resultA.domain}
                />
                {result.resultB && (
                  <StructuredDataBreakdownCard
                    breakdown={result.resultB.structuredDataBreakdown}
                    domainLabel={result.resultB.domain}
                  />
                )}
              </div>
            </section>

            {(result.resultA.investorQuestionCoverage || result.resultB?.investorQuestionCoverage) && (
              <section className="px-4 py-3 border-t border-zinc-700/60">
                <InvestorQuestionTable
                  resultsA={result.resultA.investorQuestionCoverage?.questionResults ?? []}
                  resultsB={result.resultB?.investorQuestionCoverage?.questionResults ?? null}
                  domainLabelA={result.resultA.domain}
                  domainLabelB={result.resultB?.domain ?? null}
                />
              </section>
            )}

            <section className={result.resultB ? "grid grid-cols-1 md:grid-cols-2 gap-8" : "space-y-8"} aria-labelledby="findings-heading">
              <h3 id="findings-heading" className="sr-only">
                Findings
              </h3>
              <FindingsTable
                findings={result.resultA.findings}
                domainLabel={result.resultA.domain}
              />
              {result.resultB && (
                <FindingsTable
                  findings={result.resultB.findings}
                  domainLabel={result.resultB.domain}
                />
              )}
            </section>
          </section>
        )}

        {!result && !loading && (
          <p className="text-zinc-500 text-sm">
            {domainA.trim() ? (
              <>
                Add an optional second domain to compare, or click <strong className="text-zinc-400">Scan</strong> to analyze one site. Each site is deeply crawled (homepage, robots, sitemap, discovered IR pages, and up to 14 earnings/events links), then analyzed for crawlability, structured data, parseability, freshness, and IR completeness.
              </>
            ) : (
              <>
                Enter at least one domain and click Scan, or two to Compare. Each site is deeply crawled (homepage, robots, sitemap, up to 3 IR pages from nav/sitemap, and up to 14 earnings/events links), then analyzed for crawlability, structured data, parseability, freshness, and IR completeness.
              </>
            )}
          </p>
        )}

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
          <p className="text-zinc-500 text-sm mt-1">
            Scans are rate-limited; results may be cached.
          </p>
        </footer>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

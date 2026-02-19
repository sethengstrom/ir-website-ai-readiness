import type { CrawlResult } from "../crawler";
import type { DomainResult, CategoryScores, StructuredDataBreakdown, Finding } from "../types";
import { extractFaviconUrl } from "../favicon";
import { extractDomainDisplay } from "../url-utils";
import { analyzeCrawlability } from "./crawlability";
import { analyzeStructuredData } from "./structured-data";
import { analyzeParseability } from "./parseability";
import { analyzeFreshness } from "./freshness";
import { analyzeIRChecklist } from "./ir-checklist";
import { analyzeResponseMetrics } from "./response-metrics";
import { analyzeInvestorQuestionCoverage, getUnavailableInvestorCoverage } from "./investor-questions";
import { extractJsonLdFacts } from "./json-ld-facts";
import { analyzeHostingProvider } from "./hosting-provider";

const DEFAULT_CATEGORY_SCORE = 0;
const EMPTY_FINDINGS: Finding[] = [];
const UNAVAILABLE_STRUCTURED_BREAKDOWN: StructuredDataBreakdown = {
  structuredDataScore: 0,
  jsonLdBlockCount: 0,
  detectedTypes: [],
  missingRecommendedTypes: [
    "Organization or Corporation",
    "WebSite",
    "WebPage",
    "FAQPage",
    "NewsArticle",
    "Event",
    "BreadcrumbList",
  ],
};

function runAnalyzerSync<T>(name: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.error(`[analyze] ${name} failed:`, e);
    return fallback;
  }
}

async function runAnalyzerAsync<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[analyze] ${name} failed:`, e);
    return fallback;
  }
}

export interface AnalyzeOptions {
  onProgress?: (message: string) => void;
}

export async function analyzeDomain(result: CrawlResult, options?: AnalyzeOptions): Promise<DomainResult> {
  const onProgress = options?.onProgress;
  onProgress?.("Extracting structured data from pages…");
  const pagesWithFacts = result.pages.map((p) => ({
    ...p,
    jsonLdFacts: extractJsonLdFacts(p.html, p.url),
  }));

  onProgress?.("Analyzing crawlability (robots, sitemap, IR URLs)…");
  const crawlability = runAnalyzerSync(
    "crawlability",
    () => analyzeCrawlability(result),
    { score: DEFAULT_CATEGORY_SCORE, findings: EMPTY_FINDINGS }
  );
  onProgress?.("Analyzing structured data & JSON-LD…");
  const structuredData = runAnalyzerSync(
    "structuredData",
    () => analyzeStructuredData(pagesWithFacts, result.origin),
    { score: DEFAULT_CATEGORY_SCORE, findings: EMPTY_FINDINGS, breakdown: UNAVAILABLE_STRUCTURED_BREAKDOWN }
  );
  onProgress?.("Analyzing parseability (content, headings, canonical)…");
  const parseability = runAnalyzerSync(
    "parseability",
    () => analyzeParseability(result.pages),
    { score: DEFAULT_CATEGORY_SCORE, findings: EMPTY_FINDINGS }
  );
  onProgress?.("Analyzing freshness & earnings hub…");
  const freshness = runAnalyzerSync(
    "freshness",
    () => analyzeFreshness(pagesWithFacts),
    { score: DEFAULT_CATEGORY_SCORE, findings: EMPTY_FINDINGS }
  );
  onProgress?.("Checking IR checklist (filings, events, contact)…");
  const irChecklist = runAnalyzerSync(
    "irChecklist",
    () => analyzeIRChecklist(result.pages),
    { score: DEFAULT_CATEGORY_SCORE, findings: EMPTY_FINDINGS }
  );
  onProgress?.("Detecting IR hosting provider…");
  const firstPage = result.pages[0];
  const irHosting = await runAnalyzerAsync(
    "irHosting",
    () =>
      analyzeHostingProvider(result.pages, result.origin, {
        firstPageFinalUrl: result.firstPageFinalUrl,
        firstPageFetchQuality: firstPage?.fetchQuality,
      }),
    { irHostProvider: "Internal/Other" as const, confidence: "medium" as const }
  );
  const responseMetrics = runAnalyzerSync(
    "responseMetrics",
    () => analyzeResponseMetrics(result.pages),
    { findings: EMPTY_FINDINGS }
  );

  const categoryScores: CategoryScores = {
    crawlability: crawlability.score,
    structuredData: structuredData.score,
    parseability: parseability.score,
    freshness: freshness.score,
    irChecklist: irChecklist.score,
  };

  const findings = [
    ...crawlability.findings,
    ...structuredData.findings,
    ...parseability.findings,
    ...freshness.findings,
    ...irChecklist.findings,
    ...responseMetrics.findings,
  ];

  onProgress?.("Evaluating investor question coverage…");
  const investorQuestionCoverage = runAnalyzerSync(
    "investorQuestionCoverage",
    () => analyzeInvestorQuestionCoverage(pagesWithFacts),
    getUnavailableInvestorCoverage()
  );

  onProgress?.("Computing overall & category scores…");
  // Technical foundation: same weighted blend of the five categories (used for Overall).
  const technicalWeights = {
    crawlability: 0.2,
    structuredData: 0.2,
    parseability: 0.2,
    freshness: 0.15,
    irChecklist: 0.25,
  };
  const technicalScore = Math.round(
    categoryScores.crawlability * technicalWeights.crawlability +
      categoryScores.structuredData * technicalWeights.structuredData +
      categoryScores.parseability * technicalWeights.parseability +
      categoryScores.freshness * technicalWeights.freshness +
      categoryScores.irChecklist * technicalWeights.irChecklist
  );

  // Option A: Primary score = 50% investor question coverage + 50% technical foundation.
  const overallScore = Math.round(
    investorQuestionCoverage.coverageScore * 0.5 + technicalScore * 0.5
  );

  const aiCitationReadiness = Math.round(
    investorQuestionCoverage.coverageScore * 0.7 +
      ((crawlability.score + parseability.score) / 2) * 0.2 +
      structuredData.score * 0.1
  );

  const firstPageForFavicon = result.pages[0];
  const faviconUrl =
    firstPageForFavicon?.html != null
      ? extractFaviconUrl(firstPageForFavicon.html, result.origin)
      : `${result.origin.replace(/\/$/, "")}/favicon.ico`;

  return {
    domain: extractDomainDisplay(result.origin),
    origin: result.origin,
    overallScore: Math.min(100, Math.max(0, overallScore)),
    categoryScores,
    findings,
    crawledPageCount: result.pages.length,
    irUrlCount: result.irUrlsFromCrawl.length + result.sitemap.irUrlCount,
    faviconUrl: faviconUrl ?? undefined,
    structuredDataBreakdown: structuredData.breakdown,
    aiCitationReadiness: Math.min(100, Math.max(0, aiCitationReadiness)),
    investorQuestionCoverage,
    irHosting,
  };
}

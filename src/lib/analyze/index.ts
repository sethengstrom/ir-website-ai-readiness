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

function runAnalyzer<T>(name: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.error(`[analyze] ${name} failed:`, e);
    return fallback;
  }
}

export function analyzeDomain(result: CrawlResult): DomainResult {
  const crawlability = runAnalyzer(
    "crawlability",
    () => analyzeCrawlability(result),
    { score: DEFAULT_CATEGORY_SCORE, findings: EMPTY_FINDINGS }
  );
  const structuredData = runAnalyzer(
    "structuredData",
    () => analyzeStructuredData(result.pages, result.origin),
    { score: DEFAULT_CATEGORY_SCORE, findings: EMPTY_FINDINGS, breakdown: UNAVAILABLE_STRUCTURED_BREAKDOWN }
  );
  const parseability = runAnalyzer(
    "parseability",
    () => analyzeParseability(result.pages),
    { score: DEFAULT_CATEGORY_SCORE, findings: EMPTY_FINDINGS }
  );
  const freshness = runAnalyzer(
    "freshness",
    () => analyzeFreshness(result.pages),
    { score: DEFAULT_CATEGORY_SCORE, findings: EMPTY_FINDINGS }
  );
  const irChecklist = runAnalyzer(
    "irChecklist",
    () => analyzeIRChecklist(result.pages),
    { score: DEFAULT_CATEGORY_SCORE, findings: EMPTY_FINDINGS }
  );
  const responseMetrics = runAnalyzer(
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

  const overallWeights = {
    crawlability: 0.2,
    structuredData: 0.2,
    parseability: 0.2,
    freshness: 0.15,
    irChecklist: 0.25,
  };
  const overallScore = Math.round(
    categoryScores.crawlability * overallWeights.crawlability +
      categoryScores.structuredData * overallWeights.structuredData +
      categoryScores.parseability * overallWeights.parseability +
      categoryScores.freshness * overallWeights.freshness +
      categoryScores.irChecklist * overallWeights.irChecklist
  );

  const investorQuestionCoverage = runAnalyzer(
    "investorQuestionCoverage",
    () => analyzeInvestorQuestionCoverage(result.pages),
    getUnavailableInvestorCoverage()
  );
  const aiCitationReadiness = Math.round(
    investorQuestionCoverage.coverageScore * 0.7 +
      ((crawlability.score + parseability.score) / 2) * 0.2 +
      structuredData.score * 0.1
  );

  const firstPage = result.pages[0];
  const faviconUrl =
    firstPage?.html != null
      ? extractFaviconUrl(firstPage.html, result.origin)
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
  };
}

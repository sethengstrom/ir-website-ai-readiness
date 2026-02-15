import type { CrawlResult } from "../crawler";
import type { DomainResult, CategoryScores } from "../types";
import { extractFaviconUrl } from "../favicon";
import { extractDomainDisplay } from "../url-utils";
import { analyzeCrawlability } from "./crawlability";
import { analyzeStructuredData } from "./structured-data";
import { analyzeParseability } from "./parseability";
import { analyzeFreshness } from "./freshness";
import { analyzeIRChecklist } from "./ir-checklist";
import { analyzeResponseMetrics } from "./response-metrics";
import { analyzeInvestorQuestionCoverage } from "./investor-questions";

export function analyzeDomain(result: CrawlResult): DomainResult {
  const crawlability = analyzeCrawlability(result);
  const structuredData = analyzeStructuredData(result.pages, result.origin);
  const parseability = analyzeParseability(result.pages);
  const freshness = analyzeFreshness(result.pages);
  const irChecklist = analyzeIRChecklist(result.pages);
  const responseMetrics = analyzeResponseMetrics(result.pages);

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

  // Overall AI Readiness: category blend (still shown as secondary). Adjust weights if rebalancing.
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

  // AI Citation Readiness (primary): 70% question coverage, 20% crawl/parse, 10% structured data.
  const investorQuestionCoverage = analyzeInvestorQuestionCoverage(result.pages);
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

import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { Finding } from "../types";
import { isLikelyIRPath } from "../url-utils";

const EARNINGS_KEYWORDS = ["earnings", "results", "quarter", "webcast", "transcript", "financial results"];

function pageMatchesEarningsHub(url: string, html: string): boolean {
  const path = new URL(url).pathname.toLowerCase();
  const text = (path + " " + cheerio.load(html).text().toLowerCase()).slice(0, 5000);
  return EARNINGS_KEYWORDS.some((k) => text.includes(k));
}

const DATE_REGEX = /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}\b/gi;

export function analyzeFreshness(pages: CrawlPage[]): { score: number; findings: Finding[] } {
  const findings: Finding[] = [];
  let score = 0;

  const earningsPages = pages.filter((p) => pageMatchesEarningsHub(p.url, p.html));
  const earningsScore = earningsPages.length >= 1 ? 100 : 0;
  if (earningsPages.length >= 1) {
    findings.push({
      category: "Freshness",
      subcategory: "Earnings hub",
      signal: "Latest earnings / results hub detected",
      score: 100,
      evidence: { url: earningsPages[0].url, snippet: "earnings/results/webcast keywords", method: "heuristic" },
      passed: true,
    });
  } else {
    findings.push({
      category: "Freshness",
      subcategory: "Earnings hub",
      signal: "No earnings hub page detected",
      score: 0,
      evidence: { snippet: "Looked for earnings, results, quarter, webcast, transcript", method: "heuristic" },
      passed: false,
    });
  }
  score += earningsScore * 0.4;

  let pagesWithDates = 0;
  let archiveFound = false;
  for (const page of pages) {
    const $ = cheerio.load(page.html);
    const text = $("body").text() || "";
    DATE_REGEX.lastIndex = 0;
    if (DATE_REGEX.test(text)) pagesWithDates++;
    const path = new URL(page.url).pathname.toLowerCase();
    if (path.includes("archive") || path.includes("releases") || path.includes("events"))
      archiveFound = true;
  }
  const dateScore = pagesWithDates >= 2 ? 100 : pagesWithDates >= 1 ? 60 : 0;
  findings.push({
    category: "Freshness",
    subcategory: "Dates",
    signal: `Pages with dates (press/events): ${pagesWithDates}`,
    score: dateScore,
    evidence: { method: "html_parse" },
    passed: pagesWithDates >= 1,
  });
  score += dateScore * 0.3;

  if (archiveFound) {
    findings.push({
      category: "Freshness",
      subcategory: "Archive",
      signal: "Archive pages for releases/events found",
      score: 100,
      evidence: { snippet: "URL path contains archive/releases/events", method: "heuristic" },
      passed: true,
    });
    score += 100 * 0.3;
  } else {
    findings.push({
      category: "Freshness",
      subcategory: "Archive",
      signal: "No obvious archive pages found",
      score: 0,
      evidence: { method: "heuristic" },
      passed: false,
    });
  }

  return { score: Math.min(100, Math.round(score)), findings };
}

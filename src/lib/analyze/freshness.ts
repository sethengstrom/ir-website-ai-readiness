import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { Finding } from "../types";

/**
 * Freshness / Recency & dates: signals that help AI cite current, dated IR content.
 * - Earnings hub: can AI find the page it needs for "latest earnings" answers?
 * - Dates on that hub and on other pages: can AI say "as of Q3 2025" and avoid stale citations?
 * - Archive/releases structure: can AI discover past content when needed?
 */

/** Multi-word phrases that strongly indicate an earnings/financial-results hub. Checked first. */
const EARNINGS_PHRASES = [
  "financial results",
  "quarterly results",
  "earnings results",
  "earnings call",
  "quarterly earnings",
  "investor relations",
  "press release",
  "earnings release",
  "financial release",
];

/** Single terms that indicate earnings/results content. Used for path, title, and body. */
const EARNINGS_TERMS = [
  "earnings",
  "results",
  "quarter",
  "quarterly",
  "webcast",
  "transcript",
  "financials",
  "revenue",
  "eps",
  "q1",
  "q2",
  "q3",
  "q4",
  "fy",
  "investor",
];

const EARNINGS_HUB_THRESHOLD = 4;

/**
 * Scores how strongly a page looks like an earnings/results hub by combining:
 * - URL path (strong signal: +2 per phrase/term)
 * - Page title (+2 per phrase/term)
 * - Body text first 5k chars (+1 per term, +2 per phrase; capped so one repeated word doesn't dominate)
 * Returns true if score >= EARNINGS_HUB_THRESHOLD so we catch "financial results", "quarterly results", etc.
 */
function pageMatchesEarningsHub(url: string, html: string): boolean {
  const $ = cheerio.load(html);
  const path = new URL(url).pathname.toLowerCase();
  const title = ($("title").first().text() || "").toLowerCase();
  const body = ($("body").text() || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 5000);

  let score = 0;

  // Path: strong signal
  for (const phrase of EARNINGS_PHRASES) {
    if (path.includes(phrase)) {
      score += 2;
      break; // cap path phrase at 2
    }
  }
  for (const term of EARNINGS_TERMS) {
    if (term.length >= 2 && path.includes(term)) score += 2;
  }

  // Title: strong signal
  for (const phrase of EARNINGS_PHRASES) {
    if (title.includes(phrase)) {
      score += 2;
      break;
    }
  }
  for (const term of EARNINGS_TERMS) {
    if (term.length >= 2 && title.includes(term)) score += 2;
  }

  // Body: weaker per occurrence, capped
  let bodyScore = 0;
  const bodyCap = 8;
  for (const phrase of EARNINGS_PHRASES) {
    if (bodyScore >= bodyCap) break;
    if (body.includes(phrase)) bodyScore += 2;
  }
  for (const term of EARNINGS_TERMS) {
    if (bodyScore >= bodyCap) break;
    if (term.length >= 2 && body.includes(term)) bodyScore += 1;
  }
  score += Math.min(bodyScore, bodyCap);

  return score >= EARNINGS_HUB_THRESHOLD;
}

function pageHasVisibleDate(html: string): boolean {
  const DATE_REGEX = /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}\b/gi;
  const text = cheerio.load(html)("body").text() || "";
  DATE_REGEX.lastIndex = 0;
  return DATE_REGEX.test(text);
}

const DATE_REGEX = /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}\b/gi;

export function analyzeFreshness(pages: CrawlPage[]): { score: number; findings: Finding[] } {
  const findings: Finding[] = [];
  let score = 0;

  const sortedPages = [...pages].sort((a, b) => a.url.localeCompare(b.url));
  const earningsPages = sortedPages.filter((p) => pageMatchesEarningsHub(p.url, p.html));

  // 1) Earnings hub exists (35%) — AI needs to find the right page for earnings answers.
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
  score += earningsScore * 0.35;

  // 2) Earnings hub has visible date (25%) — so AI can cite "as of" and prefer current content.
  let earningsHubHasDate = false;
  if (earningsPages.length >= 1) {
    earningsHubHasDate = pageHasVisibleDate(earningsPages[0].html);
    findings.push({
      category: "Freshness",
      subcategory: "Earnings hub",
      signal: earningsHubHasDate ? "Earnings hub page has visible date" : "Earnings hub page has no visible date",
      score: earningsHubHasDate ? 100 : 0,
      evidence: earningsHubHasDate ? { url: earningsPages[0].url, method: "html_parse" } : { url: earningsPages[0].url, method: "html_parse" },
      passed: earningsHubHasDate,
    });
  }
  score += (earningsHubHasDate ? 100 : 0) * 0.25;

  // 3) Other pages with dates (25%) — proportion of crawled pages that show dates (citation/recency).
  let pagesWithDates = 0;
  let archiveFound = false;
  for (const page of sortedPages) {
    const $ = cheerio.load(page.html);
    const text = $("body").text() || "";
    DATE_REGEX.lastIndex = 0;
    if (DATE_REGEX.test(text)) pagesWithDates++;
    const path = new URL(page.url).pathname.toLowerCase();
    if (path.includes("archive") || path.includes("releases") || path.includes("events"))
      archiveFound = true;
  }
  const n = Math.max(1, sortedPages.length);
  const dateScore = Math.round((pagesWithDates / n) * 100);
  findings.push({
    category: "Freshness",
    subcategory: "Dates",
    signal: `Pages with dates (press/events): ${pagesWithDates}/${sortedPages.length}`,
    score: dateScore,
    evidence: { method: "html_parse" },
    passed: pagesWithDates >= 1,
  });
  score += dateScore * 0.25;

  // 4) Archive/releases/events URLs (15%) — structure for past content; less critical than hub + dates for AI citation.
  if (archiveFound) {
    findings.push({
      category: "Freshness",
      subcategory: "Archive",
      signal: "Archive pages for releases/events found",
      score: 100,
      evidence: { snippet: "URL path contains archive/releases/events", method: "heuristic" },
      passed: true,
    });
    score += 100 * 0.15;
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

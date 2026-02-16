/**
 * Investor Question Coverage: 12 high-impact questions (earnings + IR navigation).
 * Demo-accurate for AI citation readiness: numeric extraction for revenue/EPS,
 * earnings-hub awareness, Answerable/Partial/Not with evidence snippet and pageType.
 */

import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { InvestorQuestionCoverage, InvestorQuestionResult, InvestorQuestionStatus } from "../types";

const QUESTION_COUNT = 12;

const INVESTOR_QUESTIONS: { id: string; question: string }[] = [
  { id: "revenue", question: "Most recent quarterly revenue" },
  { id: "eps", question: "Latest EPS" },
  { id: "next_call", question: "Next earnings call date/time" },
  { id: "earnings_release", question: "Earnings press release link" },
  { id: "webcast", question: "Earnings webcast/replay link" },
  { id: "transcript", question: "Earnings transcript link" },
  { id: "presentation", question: "Latest investor presentation / slide deck" },
  { id: "sec_filings", question: "SEC filings (10-K/10-Q)" },
  { id: "stock_ticker", question: "Stock ticker" },
  { id: "fiscal_year", question: "Fiscal year end" },
  { id: "ceo_leadership", question: "CEO / leadership page" },
  { id: "ir_contact", question: "IR contact" },
];

function getPageContent(html: string): { text: string; links: { href: string; text: string }[] } {
  const $ = cheerio.load(html);
  $("script, style, nav, footer").remove();
  const text = $("body").text()?.replace(/\s+/g, " ").trim() ?? "";
  const links: { href: string; text: string }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    const linkText = $(el).text()?.replace(/\s+/g, " ").trim() ?? "";
    if (href) links.push({ href, text: linkText });
  });
  return { text: text.slice(0, 50000), links };
}

/** Deterministic page type for UI. */
function getPageType(url: string): string {
  const p = new URL(url).pathname.toLowerCase();
  if (p === "/" || p === "") return "homepage";
  if (/earnings|results|quarterly|q[1-4]|financials|revenue/i.test(p)) return "earnings page";
  if (/sec|edgar|filings|10-k|10-q/i.test(p)) return "filings page";
  if (/presentation|slide|deck|pdf/i.test(p)) return "presentation page";
  if (/investor|ir\b/i.test(p)) return "investor page";
  if (/news|press|release/i.test(p)) return "news page";
  if (/event|webcast|replay|transcript/i.test(p)) return "events page";
  return "other";
}

const EARNINGS_CONTEXT = /earnings|results|quarter|revenue|eps|quarterly|q[1-4]|fiscal/i;

/** Prefer pages that have both earnings context and the numeric pattern. */
function hasEarningsContext(text: string): boolean {
  return EARNINGS_CONTEXT.test(text);
}

// Revenue: $1.2 billion, $950 million, revenue of $X, revenue: $X M/B
const REVENUE_PATTERN = /\$[\d,]+(\.\d+)?\s*(million|billion|M|B|mn|bn)\b|revenue\s*(?:of|:)?\s*\$?[\d,.]+\s*(?:million|billion|M|B)?/gi;

function extractRevenueSnippet(text: string): string | undefined {
  const hasContext = hasEarningsContext(text);
  const match = text.match(REVENUE_PATTERN);
  if (!match) return undefined;
  const first = match[0];
  const idx = text.indexOf(first);
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + first.length + 60);
  let snip = text.slice(start, end).trim().replace(/\s+/g, " ");
  if (snip.length > 140) snip = snip.slice(0, 137) + "…";
  return hasContext ? snip : undefined;
}

// EPS: diluted EPS of 1.23, GAAP EPS $1.23, non-GAAP EPS, earnings per share $X.XX
const EPS_PATTERN = /(?:diluted|gaap|non-gaap|adjusted)?\s*(?:EPS|earnings\s+per\s+share)\s*(?:of|:)?\s*\$?\s*[\d.]+|[\d.]+\s*\$?\s*per\s+share/gi;

function extractEPSSnippet(text: string): string | undefined {
  const hasContext = hasEarningsContext(text);
  const match = text.match(EPS_PATTERN);
  if (!match) return undefined;
  const first = match[0];
  const idx = text.indexOf(first);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + first.length + 50);
  let snip = text.slice(start, end).trim().replace(/\s+/g, " ");
  if (snip.length > 120) snip = snip.slice(0, 117) + "…";
  return hasContext ? snip : undefined;
}

/** Extract EPS snippet without requiring earnings context on same page (for multi-page combination). */
function extractEPSSnippetAnyPage(text: string): string | undefined {
  const match = text.match(EPS_PATTERN);
  if (!match) return undefined;
  const first = match[0];
  const idx = text.indexOf(first);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + first.length + 50);
  let snip = text.slice(start, end).trim().replace(/\s+/g, " ");
  if (snip.length > 120) snip = snip.slice(0, 117) + "…";
  return snip;
}

function findSnippet(text: string, pattern: RegExp, maxLen = 120): string | undefined {
  const m = text.match(pattern);
  if (!m) return undefined;
  const idx = text.indexOf(m[0]);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + m[0].length + 80);
  let snip = text.slice(start, end).trim().replace(/\s+/g, " ");
  if (snip.length > maxLen) snip = snip.slice(0, maxLen - 3) + "…";
  return snip;
}

function sortPagesForQuestions(pages: CrawlPage[]): CrawlPage[] {
  const score = (url: string): number => {
    const p = new URL(url).pathname.toLowerCase();
    if (/earnings|results|quarterly|financials/i.test(p)) return 4;
    if (p.includes("investor") || p.includes("/ir")) return 3;
    if (p.includes("news") || p.includes("press") || p.includes("release")) return 2;
    if (p === "/" || p === "") return 1;
    return 0;
  };
  return [...pages].sort((a, b) => score(b.url) - score(a.url));
}

// Patterns for non-revenue/EPS questions
const QUARTER_LABEL = /Q[1-4]\s*(?:FY|fiscal)?\s*'?\d{2,4}|(?:first|second|third|fourth)\s+quarter\s+(?:of\s+)?\d{4}/i;
const EVENT_DATE = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/i;
const WEBCAST_LINK = /webcast|listen\s+live|live\s+audio|replay|earnings\s+call/i;
const TRANSCRIPT_LINK = /transcript|call\s+transcript|earnings\s+transcript/i;
const PRESENTATION_LINK = /presentation|slide\s+deck|investor\s+presentation|\.pdf/i;
const SEC_LINK = /sec\.gov|edgar|10-?[kq]|filings?|sec\s+filing/i;
const STOCK_TICKER = /stock\s+quote|ticker|ticker\s+symbol|symbol\s*:?\s*[A-Z]{1,5}\b|nasdaq|nyse/i;
const FISCAL_YEAR = /fiscal\s+year\s+end|fye|fiscal\s+year\s+(?:ended?|ending)/i;
const LEADERSHIP = /board\s+of\s+directors|leadership|management\s+team|executive\s+team|ceo|cfo/i;
const IR_CONTACT = /investor\s+relations?|ir@|contact\s+investor|investors?@[\w.-]+\.(?:com|org)/i;
const PRESS_RELEASE = /press\s+release|earnings\s+release|news\s+release|announcement/i;

/** Combine evidence from multiple pages for revenue: snippet on one page + quarter label on another → answerable. */
function tryRevenueCombined(sorted: CrawlPage[]): InvestorQuestionResult | null {
  let revenuePage: CrawlPage | null = null;
  let revenueSnippet: string | undefined;
  let quarterPage: CrawlPage | null = null;
  for (const p of sorted) {
    const { text: t } = getPageContent(p.html);
    const snip = extractRevenueSnippet(t);
    if (snip && !revenuePage) {
      revenuePage = p;
      revenueSnippet = snip;
    }
    if (QUARTER_LABEL.test(t) && !quarterPage) quarterPage = p;
  }
  if (!revenuePage || !revenueSnippet) return null;
  const hasQuarterOnRevenuePage = QUARTER_LABEL.test(getPageContent(revenuePage.html).text);
  if (!hasQuarterOnRevenuePage && !quarterPage) {
    return { id: "revenue", question: INVESTOR_QUESTIONS.find((q) => q.id === "revenue")!.question, status: "answerable", explanation: "Revenue figure found.", sourceUrl: revenuePage.url, evidenceSnippet: revenueSnippet, pageType: getPageType(revenuePage.url) };
  }
  const explanation = quarterPage && quarterPage !== revenuePage
    ? "Quarterly revenue found; quarter label from another page."
    : "Quarterly revenue and quarter label found.";
  return { id: "revenue", question: INVESTOR_QUESTIONS.find((q) => q.id === "revenue")!.question, status: "answerable", explanation, sourceUrl: revenuePage.url, evidenceSnippet: revenueSnippet, pageType: getPageType(revenuePage.url) };
}

/** Combine evidence from multiple pages for EPS: number on one page + earnings context on another → answerable. */
function tryEPSCombined(sorted: CrawlPage[]): InvestorQuestionResult | null {
  let epsPage: CrawlPage | null = null;
  let epsSnippet: string | undefined;
  let contextPage: CrawlPage | null = null;
  for (const p of sorted) {
    const { text: t } = getPageContent(p.html);
    const snip = extractEPSSnippetAnyPage(t);
    if (snip && !epsPage) {
      epsPage = p;
      epsSnippet = snip;
    }
    if (hasEarningsContext(t) && !contextPage) contextPage = p;
  }
  if (!epsPage || !epsSnippet) return null;
  const hasContextOnEpsPage = hasEarningsContext(getPageContent(epsPage.html).text);
  if (!hasContextOnEpsPage && !contextPage) {
    return { id: "eps", question: INVESTOR_QUESTIONS.find((q) => q.id === "eps")!.question, status: "answerable", explanation: "EPS figure found.", sourceUrl: epsPage.url, evidenceSnippet: epsSnippet, pageType: getPageType(epsPage.url) };
  }
  const explanation = contextPage && contextPage !== epsPage
    ? "EPS figure found; earnings context from another page."
    : "EPS figure found.";
  return { id: "eps", question: INVESTOR_QUESTIONS.find((q) => q.id === "eps")!.question, status: "answerable", explanation, sourceUrl: epsPage.url, evidenceSnippet: epsSnippet, pageType: getPageType(epsPage.url) };
}

function testQuestion(
  id: string,
  question: string,
  pages: CrawlPage[]
): InvestorQuestionResult {
  const sorted = sortPagesForQuestions(pages);
  const pageType = (url: string) => getPageType(url);
  let best: InvestorQuestionResult = {
    id,
    question,
    status: "not_answerable",
    explanation: "No relevant page or evidence found within request limits.",
  };

  // Multi-page combination: revenue and EPS can use evidence from 2–3 pages.
  if (id === "revenue") {
    const combined = tryRevenueCombined(sorted);
    if (combined) return combined;
  }
  if (id === "eps") {
    const combined = tryEPSCombined(sorted);
    if (combined) return combined;
  }

  for (const page of sorted) {
    const { text, links } = getPageContent(page.html);
    const combined = text + " " + links.map((l) => l.href + " " + l.text).join(" ");
    const pt = pageType(page.url);

    switch (id) {
      case "revenue": {
        if (extractRevenueSnippet(text)) break;
        if (QUARTER_LABEL.test(text) && /revenue|\$[\d,.]+\s*(?:million|billion|M|B)/i.test(text)) {
          best = { id, question, status: "partial", explanation: "Earnings context and quarter found but no clear revenue snippet.", sourceUrl: page.url, pageType: pt };
        }
        break;
      }
      case "eps": {
        if (extractEPSSnippet(text)) break;
        if (hasEarningsContext(text) && /EPS|earnings\s+per\s+share|[\d.]+(\s*\$?\s*per\s+share)/i.test(text)) {
          best = { id, question, status: "partial", explanation: "EPS context found but no clear number.", sourceUrl: page.url, pageType: pt };
        }
        break;
      }
      case "next_call": {
        const hasDate = EVENT_DATE.test(text);
        const snip = findSnippet(text, EVENT_DATE);
        if (hasDate) {
          return { id, question, status: "answerable", explanation: "Earnings call or event date found.", sourceUrl: page.url, evidenceSnippet: snip, pageType: pt };
        }
        if (/\b(?:upcoming|next)\s+(?:earnings|event|call)\b/i.test(text)) {
          best = { id, question, status: "partial", explanation: "Upcoming call mentioned but no date.", sourceUrl: page.url, pageType: pt };
        }
        break;
      }
      case "earnings_release": {
        const linkMatch = links.some((l) => PRESS_RELEASE.test(l.href + " " + l.text) || /release|earnings/i.test(l.text + l.href));
        if (linkMatch) {
          const lnk = links.find((l) => PRESS_RELEASE.test(l.href + l.text) || /earnings.*release|release.*earnings/i.test(l.text + l.href));
          return { id, question, status: "answerable", explanation: "Earnings press release link found.", sourceUrl: page.url, evidenceSnippet: lnk?.href ?? lnk?.text, pageType: pt };
        }
        if (PRESS_RELEASE.test(text)) best = { id, question, status: "partial", explanation: "Press release mentioned but no direct link.", sourceUrl: page.url, pageType: pt };
        break;
      }
      case "webcast": {
        const linkMatch = links.some((l) => WEBCAST_LINK.test(l.href + " " + l.text));
        if (linkMatch) {
          const lnk = links.find((l) => WEBCAST_LINK.test(l.href + l.text));
          return { id, question, status: "answerable", explanation: "Webcast or replay link found.", sourceUrl: page.url, evidenceSnippet: lnk?.href ?? lnk?.text, pageType: pt };
        }
        if (WEBCAST_LINK.test(text)) best = { id, question, status: "partial", explanation: "Webcast mentioned but no direct link.", sourceUrl: page.url, pageType: pt };
        break;
      }
      case "transcript": {
        const linkMatch = links.some((l) => TRANSCRIPT_LINK.test(l.href + " " + l.text));
        if (linkMatch) {
          return { id, question, status: "answerable", explanation: "Transcript link found.", sourceUrl: page.url, pageType: pt };
        }
        if (TRANSCRIPT_LINK.test(text)) best = { id, question, status: "partial", explanation: "Transcript mentioned but no link.", sourceUrl: page.url, pageType: pt };
        break;
      }
      case "presentation": {
        const linkMatch = links.some((l) => PRESENTATION_LINK.test(l.href + " " + l.text));
        if (linkMatch) {
          return { id, question, status: "answerable", explanation: "Investor presentation or slide deck link found.", sourceUrl: page.url, pageType: pt };
        }
        if (PRESENTATION_LINK.test(text)) best = { id, question, status: "partial", explanation: "Presentation mentioned but no link.", sourceUrl: page.url, pageType: pt };
        break;
      }
      case "sec_filings": {
        const linkMatch = links.some((l) => SEC_LINK.test(l.href + " " + l.text));
        if (linkMatch) {
          return { id, question, status: "answerable", explanation: "SEC/EDGAR or 10-K/10-Q link found.", sourceUrl: page.url, pageType: pt };
        }
        if (SEC_LINK.test(combined)) best = { id, question, status: "partial", explanation: "SEC/filings mentioned but no direct link.", sourceUrl: page.url, pageType: pt };
        break;
      }
      case "stock_ticker": {
        const hasTicker = STOCK_TICKER.test(text) || links.some((l) => /ticker|symbol|stock\s+quote/i.test(l.text + l.href));
        const snip = findSnippet(text, STOCK_TICKER);
        if (hasTicker) {
          return { id, question, status: "answerable", explanation: "Stock ticker or quote info found.", sourceUrl: page.url, evidenceSnippet: snip, pageType: pt };
        }
        break;
      }
      case "fiscal_year": {
        const hasFye = FISCAL_YEAR.test(text);
        const snip = findSnippet(text, FISCAL_YEAR);
        if (hasFye) {
          return { id, question, status: "answerable", explanation: "Fiscal year end found.", sourceUrl: page.url, evidenceSnippet: snip, pageType: pt };
        }
        break;
      }
      case "ceo_leadership": {
        const hasLead = LEADERSHIP.test(text) || links.some((l) => LEADERSHIP.test(l.text + l.href));
        const snip = findSnippet(text, LEADERSHIP);
        if (hasLead) {
          return { id, question, status: "answerable", explanation: "CEO or leadership page/link found.", sourceUrl: page.url, evidenceSnippet: snip, pageType: pt };
        }
        break;
      }
      case "ir_contact": {
        const hasContact = IR_CONTACT.test(text) || links.some((l) => IR_CONTACT.test(l.text + l.href));
        const snip = findSnippet(text, IR_CONTACT);
        if (hasContact) {
          return { id, question, status: "answerable", explanation: "IR contact or email found.", sourceUrl: page.url, evidenceSnippet: snip, pageType: pt };
        }
        break;
      }
      default:
        break;
    }
  }

  return best;
}

export function analyzeInvestorQuestionCoverage(pages: CrawlPage[]): InvestorQuestionCoverage {
  const questionResults: InvestorQuestionResult[] = INVESTOR_QUESTIONS.map(({ id, question }) =>
    testQuestion(id, question, pages)
  );

  const answerable = questionResults.filter((r) => r.status === "answerable").length;
  const partial = questionResults.filter((r) => r.status === "partial").length;
  const coverageScore =
    QUESTION_COUNT > 0
      ? Math.round(((answerable + partial * 0.5) / QUESTION_COUNT) * 100)
      : 0;

  return {
    questionResults,
    coverageScore: Math.min(100, coverageScore),
  };
}

/** Fallback when investor-question analysis throws (graceful degradation). */
export function getUnavailableInvestorCoverage(): InvestorQuestionCoverage {
  const questionResults: InvestorQuestionResult[] = INVESTOR_QUESTIONS.map(({ id, question }) => ({
    id,
    question,
    status: "not_answerable" as const,
    explanation: "Unavailable (analysis error).",
  }));
  return { questionResults, coverageScore: 0 };
}

/**
 * Investor Question Coverage: tests ~20 common investor questions against fetched pages
 * to score "AI answerability" (citation likelihood). Deterministic, regex/heuristic only.
 */

import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { InvestorQuestionCoverage, InvestorQuestionResult, InvestorQuestionStatus } from "../types";

const QUESTION_COUNT = 20;

/** Fixed set of common investor questions (ids used for stable ordering). */
const INVESTOR_QUESTIONS: { id: string; question: string }[] = [
  { id: "revenue", question: "What is the company's most recent quarterly revenue?" },
  { id: "eps", question: "What is the latest EPS (earnings per share)?" },
  { id: "next_event", question: "When is the next earnings call or investor event?" },
  { id: "webcast", question: "Where can I find the earnings webcast or replay?" },
  { id: "transcript", question: "Where is the transcript for the latest earnings call?" },
  { id: "presentation", question: "Where is the latest investor presentation or slide deck?" },
  { id: "sec_filings", question: "Where are the SEC filings (10-K, 10-Q)?" },
  { id: "ir_contact", question: "How do I contact investor relations?" },
  { id: "fiscal_year", question: "What is the company's fiscal year end?" },
  { id: "dividend", question: "When was the last dividend declared or what is the dividend policy?" },
  { id: "annual_report", question: "Where is the annual report or 10-K?" },
  { id: "stock_quote", question: "What is the stock ticker or where can I get a stock quote?" },
  { id: "analyst_coverage", question: "Where is analyst coverage or analyst estimates?" },
  { id: "esg_sustainability", question: "Where is the ESG or sustainability report?" },
  { id: "board_leadership", question: "Who is on the board of directors or leadership team?" },
  { id: "press_releases", question: "Where are press releases or news?" },
  { id: "events_calendar", question: "Where is the events calendar or list of upcoming events?" },
  { id: "guidance_outlook", question: "What is management's guidance or financial outlook?" },
  { id: "share_repurchase", question: "What is the share repurchase or buyback program?" },
  { id: "debt_credit_rating", question: "What is the company's debt or credit rating?" },
];

/** Get visible text and hrefs from a page (deterministic). */
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

/** Order pages by relevance for IR Q&A: investor/ir/news paths first, then homepage. */
function sortPagesForQuestions(pages: CrawlPage[]): CrawlPage[] {
  const score = (url: string): number => {
    const p = new URL(url).pathname.toLowerCase();
    if (p.includes("investor") || p.includes("/ir")) return 3;
    if (p.includes("news") || p.includes("press") || p.includes("release")) return 2;
    if (p === "/" || p === "") return 1;
    return 0;
  };
  return [...pages].sort((a, b) => score(b.url) - score(a.url));
}

// --- Evidence patterns (deterministic regex) ---
const REVENUE_PATTERN = /\$[\d,]+(\.\d+)?\s*(million|billion|M|B|mn|bn)\b|revenue\s*(?:of|:)?\s*\$?[\d,.]+\s*(?:million|billion|M|B)?/i;
const EPS_PATTERN = /(?:diluted\s+)?(?:EPS|earnings\s+per\s+share)\s*(?:of|:)?\s*\$?\s*[\d.]+|[\d.]+(\s*\$?\s*per\s+share)/i;
const QUARTER_LABEL = /Q[1-4]\s*(?:FY|fiscal)?\s*'?\d{2,4}|(?:first|second|third|fourth)\s+quarter\s+(?:of\s+)?\d{4}/i;
const EVENT_DATE = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:earnings\s+call|conference\s+call|investor\s+day)\b/i;
const WEBCAST_LINK = /webcast|listen\s+live|live\s+audio|replay|earnings\s+call/i;
const TRANSCRIPT_LINK = /transcript|call\s+transcript|earnings\s+transcript/i;
const PRESENTATION_LINK = /presentation|slide\s+deck|investor\s+presentation|\.pdf/i;
const SEC_LINK = /sec\.gov|edgar|10-?[kq]|filings?|sec\s+filing/i;
const IR_CONTACT = /investor\s+relations?|ir@|contact\s+investor|investor\s+contact|investors?@[\w.-]+\.(?:com|org)/i;
const FISCAL_YEAR = /fiscal\s+year\s+end|fye|fiscal\s+year\s+(?:ended?|ending)|(?:january|february|…|december)\s+\d{1,2},?\s+\d{4}\s+\(?fiscal/i;
const DIVIDEND = /dividend|dividend\s+policy|declared\s+(?:a\s+)?dividend|per\s+share\s+dividend/i;
const ANNUAL_REPORT = /annual\s+report|10-?k|10-k|form\s+10k/i;
const STOCK_QUOTE = /stock\s+quote|ticker|ticker\s+symbol|share\s+price|nasdaq|nyse|symbol\s*:?\s*[A-Z]{1,5}\b/i;
const ANALYST = /analyst\s+coverage|analyst\s+estimates|consensus|price\s+target|ratings?\s+from/i;
const ESG = /esg|sustainability|sustainable|corporate\s+responsibility|climate|carbon/i;
const BOARD_LEADERSHIP = /board\s+of\s+directors|board\s+members|leadership|management\s+team|executive\s+team|ceo|cfo/i;
const PRESS_NEWS = /press\s+release|news\s+release|newsroom|latest\s+news|announcements?/i;
const EVENTS_CALENDAR = /events?\s+calendar|upcoming\s+events?|event\s+schedule|calendar\s+of\s+events/i;
const GUIDANCE = /guidance|outlook|forward\s+looking|forecast|expected\s+(?:revenue|earnings)/i;
const BUYBACK = /share\s+repurchase|buyback|repurchase\s+program|authorized\s+repurchase/i;
const DEBT_RATING = /credit\s+rating|debt\s+rating|moody's|s&p|fitch|investment\s+grade|borrowing/i;

function findSnippet(text: string, pattern: RegExp, maxLen = 120): string | undefined {
  const m = text.match(pattern);
  if (!m) return undefined;
  const idx = text.indexOf(m[0]);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + m[0].length + 80);
  let snip = text.slice(start, end).trim();
  if (snip.length > maxLen) snip = snip.slice(0, maxLen - 3) + "…";
  return snip;
}

function testQuestion(
  id: string,
  question: string,
  pages: CrawlPage[]
): InvestorQuestionResult {
  const sorted = sortPagesForQuestions(pages);
  let best: { status: InvestorQuestionStatus; explanation: string; sourceUrl?: string; evidenceSnippet?: string } = {
    status: "not_answerable",
    explanation: "No relevant content found on fetched pages.",
  };

  for (const page of sorted) {
    const { text, links } = getPageContent(page.html);
    const combined = text + " " + links.map((l) => l.href + " " + l.text).join(" ");

    switch (id) {
      case "revenue": {
        const hasRevenue = REVENUE_PATTERN.test(text);
        const hasQuarter = QUARTER_LABEL.test(text);
        const snip = findSnippet(text, REVENUE_PATTERN) ?? findSnippet(text, QUARTER_LABEL);
        if (hasRevenue && hasQuarter) {
          best = { status: "answerable", explanation: "Quarterly revenue and quarter label found.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        if (hasRevenue || hasQuarter) {
          best = { status: "partial", explanation: hasRevenue ? "Revenue figure found but quarter unclear." : "Quarter context found but no revenue figure.", sourceUrl: page.url, evidenceSnippet: snip };
        }
        break;
      }
      case "eps": {
        const hasEps = EPS_PATTERN.test(text);
        const snip = findSnippet(text, EPS_PATTERN);
        if (hasEps) {
          best = { status: "answerable", explanation: "EPS or per-share earnings mentioned.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        break;
      }
      case "next_event": {
        const hasDate = EVENT_DATE.test(text);
        const snip = findSnippet(text, EVENT_DATE);
        if (hasDate) {
          best = { status: "answerable", explanation: "Event or earnings call date found.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        if (/\b(?:upcoming|next)\s+(?:event|earnings)\b/i.test(text)) {
          best = { status: "partial", explanation: "Upcoming event mentioned but no date.", sourceUrl: page.url };
        }
        break;
      }
      case "webcast": {
        const linkMatch = links.some((l) => WEBCAST_LINK.test(l.href + " " + l.text));
        const textMatch = WEBCAST_LINK.test(text);
        if (linkMatch) {
          const lnk = links.find((l) => WEBCAST_LINK.test(l.href + l.text));
          best = { status: "answerable", explanation: "Webcast or replay link found.", sourceUrl: page.url, evidenceSnippet: lnk?.href ?? lnk?.text };
          return { id, question, ...best };
        }
        if (textMatch) best = { status: "partial", explanation: "Webcast mentioned but no direct link.", sourceUrl: page.url };
        break;
      }
      case "transcript": {
        const linkMatch = links.some((l) => TRANSCRIPT_LINK.test(l.href + " " + l.text));
        const textMatch = TRANSCRIPT_LINK.test(text);
        if (linkMatch) {
          best = { status: "answerable", explanation: "Transcript link found.", sourceUrl: page.url };
          return { id, question, ...best };
        }
        if (textMatch) best = { status: "partial", explanation: "Transcript mentioned but no link.", sourceUrl: page.url };
        break;
      }
      case "presentation": {
        const linkMatch = links.some((l) => PRESENTATION_LINK.test(l.href + " " + l.text));
        const textMatch = PRESENTATION_LINK.test(text);
        if (linkMatch) {
          best = { status: "answerable", explanation: "Presentation or slide deck link found.", sourceUrl: page.url };
          return { id, question, ...best };
        }
        if (textMatch) best = { status: "partial", explanation: "Presentation mentioned but no link.", sourceUrl: page.url };
        break;
      }
      case "sec_filings": {
        const linkMatch = links.some((l) => SEC_LINK.test(l.href + " " + l.text));
        const textMatch = SEC_LINK.test(combined);
        if (linkMatch) {
          best = { status: "answerable", explanation: "SEC/EDGAR or filings link found.", sourceUrl: page.url };
          return { id, question, ...best };
        }
        if (textMatch) best = { status: "partial", explanation: "SEC/filings mentioned but no direct link.", sourceUrl: page.url };
        break;
      }
      case "ir_contact": {
        const hasContact = IR_CONTACT.test(text) || links.some((l) => IR_CONTACT.test(l.text + l.href));
        const snip = findSnippet(text, IR_CONTACT);
        if (hasContact) {
          best = { status: "answerable", explanation: "IR contact or email found.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        break;
      }
      case "fiscal_year": {
        const hasFye = FISCAL_YEAR.test(text);
        const snip = findSnippet(text, FISCAL_YEAR);
        if (hasFye) {
          best = { status: "answerable", explanation: "Fiscal year end mentioned.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        break;
      }
      case "dividend": {
        const hasDiv = DIVIDEND.test(text);
        const snip = findSnippet(text, DIVIDEND);
        if (hasDiv) {
          best = { status: "answerable", explanation: "Dividend or policy mentioned.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        break;
      }
      case "annual_report": {
        const linkMatch = links.some((l) => ANNUAL_REPORT.test(l.href + " " + l.text));
        const textMatch = ANNUAL_REPORT.test(combined);
        if (linkMatch) {
          best = { status: "answerable", explanation: "Annual report or 10-K link found.", sourceUrl: page.url };
          return { id, question, ...best };
        }
        if (textMatch) best = { status: "partial", explanation: "Annual report mentioned but no direct link.", sourceUrl: page.url };
        break;
      }
      case "stock_quote": {
        const hasTicker = STOCK_QUOTE.test(text) || links.some((l) => /stock\s+quote|ticker|symbol/i.test(l.text + l.href));
        const snip = findSnippet(text, STOCK_QUOTE);
        if (hasTicker) {
          best = { status: "answerable", explanation: "Stock ticker or quote info found.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        break;
      }
      case "analyst_coverage": {
        const hasAnalyst = ANALYST.test(text) || links.some((l) => ANALYST.test(l.text + l.href));
        const snip = findSnippet(text, ANALYST);
        if (hasAnalyst) {
          best = { status: "answerable", explanation: "Analyst coverage or estimates mentioned.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        break;
      }
      case "esg_sustainability": {
        const linkMatch = links.some((l) => ESG.test(l.href + " " + l.text));
        const textMatch = ESG.test(text);
        if (linkMatch) {
          best = { status: "answerable", explanation: "ESG or sustainability link found.", sourceUrl: page.url };
          return { id, question, ...best };
        }
        if (textMatch) best = { status: "partial", explanation: "ESG/sustainability mentioned but no direct link.", sourceUrl: page.url };
        break;
      }
      case "board_leadership": {
        const hasBoard = BOARD_LEADERSHIP.test(text) || links.some((l) => BOARD_LEADERSHIP.test(l.text + l.href));
        const snip = findSnippet(text, BOARD_LEADERSHIP);
        if (hasBoard) {
          best = { status: "answerable", explanation: "Board or leadership info found.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        break;
      }
      case "press_releases": {
        const linkMatch = links.some((l) => PRESS_NEWS.test(l.href + " " + l.text));
        const textMatch = PRESS_NEWS.test(text);
        if (linkMatch) {
          best = { status: "answerable", explanation: "Press releases or newsroom link found.", sourceUrl: page.url };
          return { id, question, ...best };
        }
        if (textMatch) best = { status: "partial", explanation: "Press/news mentioned but no direct link.", sourceUrl: page.url };
        break;
      }
      case "events_calendar": {
        const linkMatch = links.some((l) => EVENTS_CALENDAR.test(l.href + " " + l.text));
        const textMatch = EVENTS_CALENDAR.test(text);
        if (linkMatch || textMatch) {
          best = { status: "answerable", explanation: "Events calendar or upcoming events found.", sourceUrl: page.url };
          return { id, question, ...best };
        }
        if (/\bupcoming\s+events?\b|\bevents?\s+and\s+presentations\b/i.test(text)) {
          best = { status: "partial", explanation: "Events section mentioned but no calendar link.", sourceUrl: page.url };
        }
        break;
      }
      case "guidance_outlook": {
        const hasGuidance = GUIDANCE.test(text);
        const snip = findSnippet(text, GUIDANCE);
        if (hasGuidance) {
          best = { status: "answerable", explanation: "Guidance or outlook mentioned.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        break;
      }
      case "share_repurchase": {
        const hasBuyback = BUYBACK.test(text);
        const snip = findSnippet(text, BUYBACK);
        if (hasBuyback) {
          best = { status: "answerable", explanation: "Share repurchase or buyback mentioned.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        break;
      }
      case "debt_credit_rating": {
        const hasRating = DEBT_RATING.test(text);
        const snip = findSnippet(text, DEBT_RATING);
        if (hasRating) {
          best = { status: "answerable", explanation: "Debt or credit rating mentioned.", sourceUrl: page.url, evidenceSnippet: snip };
          return { id, question, ...best };
        }
        break;
      }
      default:
        break;
    }
  }

  return { id, question, ...best };
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

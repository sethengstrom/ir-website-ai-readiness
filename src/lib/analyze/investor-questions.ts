/**
 * Investor Question Coverage: tests ~10 common investor questions against fetched pages
 * to score "AI answerability" (citation likelihood). Deterministic, regex/heuristic only.
 */

import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { InvestorQuestionCoverage, InvestorQuestionResult, InvestorQuestionStatus } from "../types";

const QUESTION_COUNT = 10;

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

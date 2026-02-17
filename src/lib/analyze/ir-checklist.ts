import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { Finding } from "../types";

const PATTERNS = {
  filings: [
    /sec\.gov|edgar|sedar|filings?|sec-filings?|financial.?reports?|annual.?report|10-[kq]|form.?10/i,
    /\bsec\b|regulatory|disclosure|financials?\b|regulatory\s+filings?/i,
  ],
  presentation: [
    /investor.?presentation|presentations?|investor.?deck|slide/i,
  ],
  pressReleases: [
    /press.?release|newsroom|news.?room|press.?room|releases?|announcements?/i,
    /\bpress\b|\bnews\b|media\s+room/i,
  ],
  events: [
    /events?|webcast|conference|earnings.?call|investor.?day/i,
  ],
  irContact: [
    /investor.?relations?|ir@|contact.?investor|investor.?contact/i,
  ],
  governance: [
    /governance|esg|sustainability|board|corporate.?governance/i,
  ],
} as const;

type ChecklistKey = keyof typeof PATTERNS;

/** Build searchable string for one link: text, href, title, aria-label (so we catch nav items that use title/aria-label only). */
function linkSearchString($: ReturnType<typeof cheerio.load>, el: unknown): string {
  const $el = $(el as Parameters<ReturnType<typeof cheerio.load>>[0]);
  const text = $el.text().trim();
  const href = $el.attr("href") ?? "";
  const title = $el.attr("title") ?? "";
  const ariaLabel = $el.attr("aria-label") ?? "";
  return [text, href, title, ariaLabel].filter(Boolean).join(" ");
}

function findMatchingUrl(pages: CrawlPage[], key: ChecklistKey): { url: string; snippet: string } | null {
  for (const page of pages) {
    const $ = cheerio.load(page.html);
    const path = new URL(page.url).pathname;
    const linkParts = $("a[href]")
      .map((_, el) => linkSearchString($, el))
      .get();
    const combined = (path + " " + linkParts.join(" ") + " " + page.url).toLowerCase();

    for (const re of PATTERNS[key]) {
      if (re.test(combined)) {
        const firstMatch = $("a[href]").filter((_, el) => re.test(linkSearchString($, el).toLowerCase())).first();
        const textSnippet = firstMatch.text().trim().slice(0, 80);
        const fallback = firstMatch.attr("title") || firstMatch.attr("aria-label") || firstMatch.attr("href") || path;
        return { url: page.url, snippet: textSnippet || (typeof fallback === "string" ? fallback.slice(0, 80) : path) };
      }
    }
  }
  return null;
}

export function analyzeIRChecklist(pages: CrawlPage[]): { score: number; findings: Finding[] } {
  const findings: Finding[] = [];
  const keys: ChecklistKey[] = [
    "filings",
    "presentation",
    "pressReleases",
    "events",
    "irContact",
    "governance",
  ];
  let passed = 0;

  const labels: Record<ChecklistKey, string> = {
    filings: "Filings (SEC/EDGAR or SEDAR+)",
    presentation: "Investor presentation",
    pressReleases: "Press releases / newsroom",
    events: "Events / webcasts",
    irContact: "IR contact info",
    governance: "Governance / ESG links",
  };

  for (const key of keys) {
    const match = findMatchingUrl(pages, key);
    const found = !!match;
    if (found) passed++;
    findings.push({
      category: "IR completeness",
      subcategory: "Checklist",
      signal: labels[key],
      score: found ? 100 : 0,
      evidence: match
        ? { url: match.url, snippet: match.snippet, method: "heuristic" }
        : { method: "heuristic" },
      passed: found,
    });
  }

  const score = keys.length ? Math.round((passed / keys.length) * 100) : 0;
  return { score, findings };
}

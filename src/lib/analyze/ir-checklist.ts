import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { Finding } from "../types";

const PATTERNS = {
  filings: [
    /sec\.gov|edgar|sedar|filings?|sec-filings?|financial.?reports?|annual.?report|10-[kq]|form.?10/i,
  ],
  presentation: [
    /investor.?presentation|presentations?|investor.?deck|slide/i,
  ],
  pressReleases: [
    /press.?release|newsroom|news.?room|press.?room|releases?|announcements?/i,
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

function findMatchingUrl(pages: CrawlPage[], key: ChecklistKey): { url: string; snippet: string } | null {
  for (const page of pages) {
    const $ = cheerio.load(page.html);
    const path = new URL(page.url).pathname;
    const linkTexts = $("a[href]")
      .map((_, el) => $(el).text().trim() + " " + $(el).attr("href"))
      .get()
      .join(" ");
    const combined = (path + " " + linkTexts + " " + page.url).toLowerCase();

    for (const re of PATTERNS[key]) {
      if (re.test(combined)) {
        const snippet = $("a[href]")
          .filter((_, el) => re.test(($(el).text() + " " + $(el).attr("href")).toLowerCase()))
          .first()
          .text()
          .trim()
          .slice(0, 80);
        return { url: page.url, snippet: snippet || path };
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

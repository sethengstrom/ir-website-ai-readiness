import type { CrawlPage } from "../crawler";
import type { Finding } from "../types";

export function analyzeResponseMetrics(pages: CrawlPage[]): { findings: Finding[] } {
  const findings: Finding[] = [];

  for (const page of pages) {
    const status = page.status;
    const ok = status >= 200 && status < 300;
    findings.push({
      category: "Response",
      subcategory: "HTTP",
      signal: `HTTP ${status}`,
      score: ok ? 100 : status > 0 ? 50 : 0,
      evidence: { url: page.url, snippet: `Status: ${status}`, method: "http_header" },
      passed: ok,
    });

    if (page.responseTimeMs != null) {
      const fast = page.responseTimeMs < 2000;
      findings.push({
        category: "Response",
        subcategory: "Timing",
        signal: `Response time: ${page.responseTimeMs}ms`,
        score: fast ? 100 : page.responseTimeMs < 5000 ? 70 : 40,
        evidence: { url: page.url, snippet: `${page.responseTimeMs}ms`, method: "http_header" },
        passed: page.responseTimeMs < 8000,
      });
    }

    if (page.lastModified) {
      findings.push({
        category: "Response",
        subcategory: "Headers",
        signal: "Last-Modified present",
        score: 100,
        evidence: { url: page.url, snippet: page.lastModified, method: "http_header" },
        passed: true,
      });
    }
  }

  return { findings };
}

import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { Finding } from "../types";

const SCHEMA_TYPES_OF_INTEREST = [
  "FAQPage",
  "QAPage",
  "NewsArticle",
  "PressRelease",
  "Event",
  "Organization",
  "WebPage",
  "FinancialReport",
];

function extractJsonLdTypes(html: string): { types: string[]; raw: string }[] {
  const $ = cheerio.load(html);
  const results: { types: string[]; raw: string }[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).html()?.trim();
    if (!text) return;
    try {
      let data = JSON.parse(text);
      if (Array.isArray(data)) {
        data.forEach((item) => {
          const types = getTypes(item);
          if (types.length) results.push({ types, raw: text.slice(0, 200) });
        });
      } else {
        const types = getTypes(data);
        if (types.length) results.push({ types, raw: text.slice(0, 200) });
      }
    } catch {
      // ignore invalid JSON-LD
    }
  });
  return results;
}

function getTypes(obj: { "@type"?: string | string[] }): string[] {
  const t = obj["@type"];
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

function detectFeedUrls(html: string, baseOrigin: string): { href: string; type: string }[] {
  const $ = cheerio.load(html);
  const feeds: { href: string; type: string }[] = [];
  $('link[type="application/rss+xml"], link[type="application/atom+xml"]').each((_, el) => {
    const href = $(el).attr("href");
    const type = $(el).attr("type") || "";
    if (href) {
      try {
        const url = new URL(href, baseOrigin);
        feeds.push({ href: url.href, type });
      } catch {
        // skip
      }
    }
  });
  return feeds;
}

const COMMON_FEED_PATHS = ["/feed", "/rss", "/atom", "/news/feed", "/press/feed", "/blog/feed"];

export function analyzeStructuredData(
  pages: CrawlPage[],
  origin: string
): { score: number; findings: Finding[] } {
  const findings: Finding[] = [];
  const seenTypes = new Set<string>();
  const allSchemaTypes: { type: string; url: string; snippet: string }[] = [];
  const feedUrls = new Set<string>();

  for (const page of pages) {
    const items = extractJsonLdTypes(page.html);
    for (const { types, raw } of items) {
      for (const t of types) {
        if (!seenTypes.has(t)) {
          seenTypes.add(t);
          allSchemaTypes.push({ type: t, url: page.url, snippet: raw });
        }
      }
    }
    const feeds = detectFeedUrls(page.html, origin);
    feeds.forEach((f) => feedUrls.add(f.href));
  }

  // Check for interesting schema types
  const ofInterest = SCHEMA_TYPES_OF_INTEREST.filter((t) => seenTypes.has(t));
  const schemaScore = ofInterest.length >= 4 ? 100 : ofInterest.length >= 2 ? 70 : ofInterest.length >= 1 ? 40 : 0;

  if (allSchemaTypes.length > 0) {
    findings.push({
      category: "Structured data",
      subcategory: "JSON-LD",
      signal: `Schema types: ${[...seenTypes].join(", ")}`,
      score: schemaScore,
      evidence: {
        url: allSchemaTypes[0]?.url,
        snippet: allSchemaTypes[0]?.type,
        method: "json_ld",
      },
      passed: ofInterest.length >= 1,
    });
  } else {
    findings.push({
      category: "Structured data",
      subcategory: "JSON-LD",
      signal: "No JSON-LD blocks detected",
      score: 0,
      evidence: { method: "json_ld" },
      passed: false,
    });
  }

  ["FAQPage", "QAPage", "NewsArticle", "PressRelease", "Event", "Organization"].forEach((t) => {
    findings.push({
      category: "Structured data",
      subcategory: "JSON-LD",
      signal: t,
      score: seenTypes.has(t) ? 100 : 0,
      evidence: seenTypes.has(t)
        ? { url: allSchemaTypes.find((s) => s.type === t)?.url, method: "json_ld" }
        : { method: "json_ld" },
      passed: seenTypes.has(t),
    });
  });

  // RSS/Atom
  const feedCount = feedUrls.size;
  const feedScore = feedCount >= 1 ? 100 : 0;
  findings.push({
    category: "Structured data",
    subcategory: "Feeds",
    signal: feedCount ? `RSS/Atom feeds: ${feedCount}` : "No RSS/Atom feeds found",
    score: feedScore,
    evidence:
      feedCount > 0
        ? { url: [...feedUrls][0], snippet: "link rel feed", method: "link_tag" }
        : { method: "link_tag" },
    passed: feedCount >= 1,
  });

  const score = Math.round((schemaScore * 0.7 + feedScore * 0.3));
  return { score: Math.min(100, score), findings };
}

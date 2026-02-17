import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { Finding, StructuredDataBreakdown } from "../types";
import type { PageWithFacts } from "./json-ld-facts";

/** IR-recommended schema types for structured data score. Organization/Corporation count as one slot. */
const RECOMMENDED_IR_TYPES = [
  "WebSite",
  "WebPage",
  "FAQPage",
  "NewsArticle",
  "Event",
  "BreadcrumbList",
] as const;

const SCHEMA_TYPES_OF_INTEREST = [
  "FAQPage",
  "QAPage",
  "NewsArticle",
  "PressRelease",
  "Event",
  "Organization",
  "Corporation",
  "WebSite",
  "WebPage",
  "FinancialReport",
  "Report",
  "BreadcrumbList",
];

function getTypes(obj: { "@type"?: string | string[] }): string[] {
  const t = obj["@type"];
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

function hasDateFields(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (o.datePublished || o.dateModified || o.dateCreated) return true;
  if (o.mainEntity && hasDateFields(o.mainEntity)) return true;
  return false;
}

function hasOrganizationIdentity(obj: Record<string, unknown>): boolean {
  const name = obj.name ?? obj.legalName;
  const hasName = typeof name === "string" && name.trim().length > 0;
  const hasUrl =
    typeof obj.url === "string" ||
    (typeof obj.url === "object" && obj.url != null) ||
    (Array.isArray(obj.sameAs) && obj.sameAs.length > 0) ||
    (typeof obj.sameAs === "string" && obj.sameAs.trim().length > 0);
  const hasLogo = typeof obj.logo === "string" || (typeof obj.logo === "object" && obj.logo != null);
  return hasName && (hasUrl || hasLogo);
}

// Walk objects/arrays to find any node with datePublished/dateModified
function anyNodeHasDates(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (o.datePublished || o.dateModified || o.dateCreated) return true;
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) {
      if (v.some((item) => anyNodeHasDates(item))) return true;
    } else if (typeof v === "object" && v !== null) {
      if (anyNodeHasDates(v)) return true;
    }
  }
  return false;
}

/** Flatten @graph so Organization/WebPage inside are detected (common pattern on IR sites). */
function flattenJsonLdItems(data: unknown): unknown[] {
  const items = Array.isArray(data) ? data : [data];
  const out: unknown[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (Array.isArray(o["@graph"])) {
      for (const g of o["@graph"]) {
        if (g && typeof g === "object") out.push(g);
      }
    } else {
      out.push(item);
    }
  }
  return out;
}

interface JsonLdBlock {
  types: string[];
  raw: string;
  obj: unknown;
}

function extractJsonLdBlocks(html: string): { blocks: JsonLdBlock[]; hadContext: boolean } {
  const $ = cheerio.load(html);
  const blocks: JsonLdBlock[] = [];
  let hadContext = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).html()?.trim();
    if (!text) return;
    try {
      let data: unknown = JSON.parse(text);
      if (data && typeof data === "object" && (data as Record<string, unknown>)["@context"] != null) {
        hadContext = true;
      }
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const items = flattenJsonLdItems(data);
      items.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const types = getTypes(item as { "@type"?: string | string[] });
        if (types.length) blocks.push({ types, raw: text.slice(0, 200), obj: item });
      });
    } catch {
      // ignore invalid JSON-LD
    }
  });
  return { blocks, hadContext };
}

/** Collect distinct field names present in schema (name, url, datePublished, headline, description, sameAs, logo). */
const FIELD_COMPLETENESS_KEYS = ["name", "url", "datePublished", "headline", "description", "sameAs", "logo"] as const;

function countFieldsInObject(obj: unknown, seen: Set<string>): void {
  if (!obj || typeof obj !== "object") return;
  const o = obj as Record<string, unknown>;
  for (const key of FIELD_COMPLETENESS_KEYS) {
    if (o[key] != null && (typeof o[key] === "string" ? (o[key] as string).trim() : true)) {
      seen.add(key);
    }
  }
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) {
      v.forEach((item) => countFieldsInObject(item, seen));
    } else if (typeof v === "object" && v !== null) {
      countFieldsInObject(v, seen);
    }
  }
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
  pages: PageWithFacts[],
  origin: string
): { score: number; findings: Finding[]; breakdown: StructuredDataBreakdown } {
  const findings: Finding[] = [];
  const seenTypes = new Set<string>();
  const firstTickerFromFacts = pages.map((p) => p.jsonLdFacts?.ticker).find(Boolean) as string | undefined;
  const firstOrgNameFromFacts = pages.map((p) => p.jsonLdFacts?.orgName).find(Boolean) as string | undefined;
  const allSchemaTypes: { type: string; url: string; snippet: string }[] = [];
  const feedUrls = new Set<string>();
  const fieldsPresent = new Set<string>();
  let anyHadContext = false;

  let hasOrgWithIdentity = false;
  let hasMachineReadableDates = false;
  let hasBreadcrumbList = false;
  let hasTickerSymbol = false;
  let totalJsonLdBlocks = 0;

  for (const page of pages) {
    const { blocks, hadContext } = extractJsonLdBlocks(page.html);
    if (hadContext) anyHadContext = true;
    totalJsonLdBlocks += blocks.length;
    for (const { types, raw, obj } of blocks) {
      countFieldsInObject(obj, fieldsPresent);
      for (const t of types) {
        if (!seenTypes.has(t)) {
          seenTypes.add(t);
          allSchemaTypes.push({ type: t, url: page.url, snippet: raw });
        }
      }
      const o = obj as Record<string, unknown>;
      const typesList = getTypes(o as { "@type"?: string | string[] });
      if (
        typesList.some((t) => t === "Organization" || t === "Corporation") &&
        hasOrganizationIdentity(o)
      ) {
        hasOrgWithIdentity = true;
        if (typeof o.tickerSymbol === "string" && o.tickerSymbol.trim()) hasTickerSymbol = true;
      }
      if (typesList.includes("BreadcrumbList")) hasBreadcrumbList = true;
      if (anyNodeHasDates(obj)) hasMachineReadableDates = true;
    }
    const feeds = detectFeedUrls(page.html, origin);
    feeds.forEach((f) => feedUrls.add(f.href));
  }

  // --- Structured Data (JSON-LD only) score and breakdown ---
  const detectedTypes = [...seenTypes].sort();
  const missingRecommendedTypes: string[] = [];
  if (!seenTypes.has("Organization") && !seenTypes.has("Corporation")) {
    missingRecommendedTypes.push("Organization or Corporation");
  }
  for (const t of RECOMMENDED_IR_TYPES) {
    if (!seenTypes.has(t)) missingRecommendedTypes.push(t);
  }

  let structuredDataScore = 0;
  if (totalJsonLdBlocks > 0) {
    structuredDataScore += 15; // presence of ld+json
    structuredDataScore += 10; // valid parse (we only count parsed blocks)
    if (anyHadContext) structuredDataScore += 10;
    structuredDataScore += 10; // @type (we only push blocks with @type)
    const hasOrgOrCorp = seenTypes.has("Organization") || seenTypes.has("Corporation");
    let typeCoverage = hasOrgOrCorp ? 5 : 0;
    for (const t of RECOMMENDED_IR_TYPES) {
      if (seenTypes.has(t)) typeCoverage += 5;
    }
    structuredDataScore += Math.min(35, typeCoverage);
    const fieldScore = Math.min(20, Math.round((fieldsPresent.size / FIELD_COMPLETENESS_KEYS.length) * 20));
    structuredDataScore += fieldScore;
  }
  structuredDataScore = Math.min(100, structuredDataScore);

  const breakdown: StructuredDataBreakdown = {
    structuredDataScore,
    jsonLdBlockCount: totalJsonLdBlocks,
    detectedTypes,
    missingRecommendedTypes,
  };

  // Base score from schema types of interest (IR/LLM-relevant)
  const ofInterest = SCHEMA_TYPES_OF_INTEREST.filter((t) => seenTypes.has(t));
  let schemaScore =
    ofInterest.length >= 4 ? 85 : ofInterest.length >= 2 ? 65 : ofInterest.length >= 1 ? 45 : 0;

  // LLM/IR-friendly bonuses: reward schema designed for AI to read and cite
  let llmBonus = 0;
  if (hasOrgWithIdentity) {
    llmBonus += 20;
    findings.push({
      category: "Structured data",
      subcategory: "IR/LLM-friendly",
      signal: "Organization/Corporation with identity (name + url/logo)",
      score: 100,
      evidence: {
        url: allSchemaTypes.find((s) => s.type === "Organization" || s.type === "Corporation")?.url,
        snippet: firstOrgNameFromFacts ? `Organization: ${firstOrgNameFromFacts}` : "Helps AI identify and cite your company",
        method: "json_ld",
      },
      passed: true,
    });
  }
  if (hasMachineReadableDates) {
    llmBonus += 15;
    findings.push({
      category: "Structured data",
      subcategory: "IR/LLM-friendly",
      signal: "Machine-readable dates (datePublished/dateModified) in schema",
      score: 100,
      evidence: {
        snippet: "Helps LLMs use and cite content with correct dates",
        method: "json_ld",
      },
      passed: true,
    });
  }
  if (hasBreadcrumbList) {
    llmBonus += 5;
    findings.push({
      category: "Structured data",
      subcategory: "IR/LLM-friendly",
      signal: "BreadcrumbList for page context",
      score: 100,
      evidence: { method: "json_ld" },
      passed: true,
    });
  }
  if (hasTickerSymbol) {
    llmBonus += 10;
    findings.push({
      category: "Structured data",
      subcategory: "IR/LLM-friendly",
      signal: "Corporation ticker symbol in schema",
      score: 100,
      evidence: { snippet: firstTickerFromFacts ? `Ticker in schema: ${firstTickerFromFacts}` : "Investor-oriented identifier for AI", method: "json_ld" },
      passed: true,
    });
  }
  if (totalJsonLdBlocks >= 2) {
    findings.push({
      category: "Structured data",
      subcategory: "JSON-LD",
      signal: `Multiple JSON-LD blocks (${totalJsonLdBlocks})`,
      score: 80,
      evidence: { snippet: "Indicates intentional structured data for agents", method: "json_ld" },
      passed: true,
    });
  }

  schemaScore = Math.min(100, schemaScore + llmBonus);

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

  [
    "FAQPage",
    "QAPage",
    "NewsArticle",
    "PressRelease",
    "Event",
    "Organization",
    "Corporation",
    "BreadcrumbList",
  ].forEach((t) => {
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

  const score = Math.round(schemaScore * 0.65 + feedScore * 0.35);
  return { score: Math.min(100, score), findings, breakdown };
}

/**
 * Extract IR-relevant values from JSON-LD on a page (ticker, org name, event dates, contact, schema dates).
 * Used by investor-questions, structured-data evidence, and freshness so we use schema values, not just presence.
 */

import * as cheerio from "cheerio";
import type { JsonLdFacts } from "../types";
import type { CrawlPage } from "../crawler";

function getTypes(obj: { "@type"?: string | string[] }): string[] {
  const t = obj["@type"];
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

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

function toString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** Extract a single string from ContactPoint (email, url, or nested). */
function extractContactPoint(cp: unknown): JsonLdFacts["contactPoint"] {
  if (!cp || typeof cp !== "object") return undefined;
  const o = cp as Record<string, unknown>;
  const email = toString(o.email);
  const url = typeof o.url === "string" ? o.url.trim() : undefined;
  const contactType = toString(o.contactType);
  if (email || url) return { email, url, contactType };
  return undefined;
}

/**
 * Parse all application/ld+json on the page and return a single aggregate of IR-relevant facts.
 * First value wins for single-value fields; eventDates collects all Event.startDate (and name).
 */
export function extractJsonLdFacts(html: string, _pageUrl: string): JsonLdFacts {
  const $ = cheerio.load(html);
  const facts: JsonLdFacts = {};
  const eventDates: { startDate: string; endDate?: string; name?: string }[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).html()?.trim();
    if (!text) return;
    try {
      let data: unknown = JSON.parse(text);
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const items = flattenJsonLdItems(data);
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const types = getTypes(o as { "@type"?: string | string[] });

        if (types.some((t) => t === "Organization" || t === "Corporation")) {
          if (!facts.ticker && typeof o.tickerSymbol === "string" && o.tickerSymbol.trim()) {
            facts.ticker = o.tickerSymbol.trim();
          }
          if (!facts.orgName) {
            const name = o.name ?? o.legalName;
            facts.orgName = toString(name);
          }
          if (!facts.contactPoint && (o.contactPoint != null)) {
            const cp = Array.isArray(o.contactPoint) ? o.contactPoint[0] : o.contactPoint;
            facts.contactPoint = extractContactPoint(cp);
          }
        }

        if (types.includes("Event") && typeof o.startDate === "string" && o.startDate.trim()) {
          eventDates.push({
            startDate: o.startDate.trim(),
            endDate: typeof o.endDate === "string" ? o.endDate.trim() : undefined,
            name: toString(o.name),
          });
        }

        if (!facts.datePublished && (o.datePublished != null)) {
          const d = typeof o.datePublished === "string" ? o.datePublished.trim() : undefined;
          if (d) facts.datePublished = d;
        }
        if (!facts.dateModified && (o.dateModified != null)) {
          const d = typeof o.dateModified === "string" ? o.dateModified.trim() : undefined;
          if (d) facts.dateModified = d;
        }

        // Recurse into mainEntity (e.g. FAQPage, WebPage with nested Article)
        if (o.mainEntity && typeof o.mainEntity === "object") {
          const main = Array.isArray(o.mainEntity) ? o.mainEntity[0] : o.mainEntity;
          if (main && typeof main === "object") {
            const m = main as Record<string, unknown>;
            if (!facts.datePublished && m.datePublished != null) {
              const d = typeof m.datePublished === "string" ? m.datePublished.trim() : undefined;
              if (d) facts.datePublished = d;
            }
            if (!facts.dateModified && m.dateModified != null) {
              const d = typeof m.dateModified === "string" ? m.dateModified.trim() : undefined;
              if (d) facts.dateModified = d;
            }
          }
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  });

  if (eventDates.length) facts.eventDates = eventDates;
  return facts;
}

/** Page type that may have pre-extracted JSON-LD facts (set by analyze layer). */
export type PageWithFacts = CrawlPage & { jsonLdFacts?: JsonLdFacts };

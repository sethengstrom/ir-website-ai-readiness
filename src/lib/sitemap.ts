/**
 * Fetch and parse sitemap index + child sitemaps. Extract URLs (especially IR-related).
 */

import * as cheerio from "cheerio";
import { normalizeUrl, isSameDomain, isLikelyIRPath } from "./url-utils";

const DEFAULT_USER_AGENT = "IR-AI-Readiness-Scanner/1.0";

export interface SitemapResult {
  reachable: boolean;
  urlCount: number;
  irUrlCount: number;
  urls: string[];
  irUrls: string[];
  childSitemaps: string[];
}

export async function fetchSitemap(
  sitemapUrl: string,
  origin: string
): Promise<{ type: "index" | "urlset"; urls: string[]; childSitemaps: string[] }> {
  const res = await fetch(sitemapUrl, {
    headers: { "User-Agent": DEFAULT_USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Sitemap ${sitemapUrl} returned ${res.status}`);
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const urls: string[] = [];
  const childSitemaps: string[] = [];

  $("url loc").each((_, el) => {
    const loc = $(el).text().trim();
    const norm = normalizeUrl(loc, origin);
    if (norm && isSameDomain(norm, origin)) urls.push(norm);
  });
  $("sitemap loc").each((_, el) => {
    const loc = $(el).text().trim();
    const norm = normalizeUrl(loc, origin);
    if (norm && isSameDomain(norm, origin)) childSitemaps.push(norm);
  });

  const type = childSitemaps.length > 0 ? "index" : "urlset";
  return { type, urls, childSitemaps };
}

export async function discoverAndParseSitemaps(origin: string): Promise<SitemapResult> {
  const result: SitemapResult = {
    reachable: false,
    urlCount: 0,
    irUrlCount: 0,
    urls: [],
    irUrls: [],
    childSitemaps: [],
  };

  const base = origin.replace(/\/$/, "");
  const candidates = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap-index.xml`,
    `${base}/sitemap/index.xml`,
  ];

  let sitemapUrl: string | null = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": DEFAULT_USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        sitemapUrl = url;
        result.reachable = true;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!sitemapUrl) return result;

  const seen = new Set<string>();
  const allUrls: string[] = [];
  const queue: string[] = [sitemapUrl];
  const maxChildSitemaps = 20;
  let childCount = 0;

  while (queue.length > 0 && childCount < maxChildSitemaps) {
    const current = queue.shift()!;
    try {
      const { urls, childSitemaps } = await fetchSitemap(current, origin);
      for (const u of urls) {
        if (!seen.has(u)) {
          seen.add(u);
          allUrls.push(u);
        }
      }
      for (const child of childSitemaps) {
        if (!seen.has(child)) {
          seen.add(child);
          queue.push(child);
          childCount++;
        }
      }
      if (childSitemaps.length === 0 && result.childSitemaps.length === 0)
        result.childSitemaps.push(current);
    } catch {
      // skip failed sitemap
    }
  }

  result.urls = [...allUrls];
  result.urlCount = result.urls.length;
  result.irUrls = result.urls.filter((u) => {
    try {
      return isLikelyIRPath(new URL(u).pathname);
    } catch {
      return false;
    }
  });
  result.irUrlCount = result.irUrls.length;
  return result;
}

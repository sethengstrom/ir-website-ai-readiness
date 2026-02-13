/**
 * Sitemap-first crawl; fallback shallow crawl (depth 3) from likely IR paths.
 * Respects robots.txt, rate limit, timeouts, retries.
 */

import * as cheerio from "cheerio";
import {
  normalizeUrl,
  getOrigin,
  isSameDomain,
  isLikelyIRPath,
} from "./url-utils";
import { fetchRobots, type RobotsResult } from "./robots";
import { discoverAndParseSitemaps, type SitemapResult } from "./sitemap";

const USER_AGENT = "IR-AI-Readiness-Scanner/1.0";
const RATE_LIMIT_MS = 500;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const MAX_PAGES_CRAWL = 80;
const MAX_PAGES_SITEMAP = 150;

export interface CrawlPage {
  url: string;
  html: string;
  status: number;
  contentType: string;
}

export interface CrawlResult {
  origin: string;
  robots: RobotsResult;
  sitemap: SitemapResult;
  pages: CrawlPage[];
  urlsFromCrawl: string[];
  irUrlsFromCrawl: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES
): Promise<{ html: string; status: number; contentType: string }> {
  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml"))
        return { html: "", status: res.status, contentType };
      const html = await res.text();
      return { html, status: res.status, contentType };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (i < retries) await sleep(RATE_LIMIT_MS * 2);
  }
  throw lastError ?? new Error("Fetch failed");
}

function extractLinks(html: string, baseOrigin: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:"))
      return;
    const norm = normalizeUrl(href, baseOrigin);
    if (norm && isSameDomain(norm, baseOrigin)) links.push(norm);
  });
  return [...new Set(links)];
}

/** Decide if we are allowed to fetch this path per robots (simple check). */
function isAllowedByRobots(pathname: string, robots: RobotsResult): boolean {
  if (!robots.reachable) return true;
  const lower = pathname.toLowerCase();
  if (robots.disallowsInvestors && (lower === "/investors" || lower.startsWith("/investors/")))
    return false;
  if (
    robots.disallowsInvestorRelations &&
    (lower === "/investor-relations" || lower.startsWith("/investor-relations/"))
  )
    return false;
  return true;
}

/** Get seed URLs for fallback crawl: homepage + common IR paths. */
function getFallbackSeeds(origin: string): string[] {
  const base = origin.replace(/\/$/, "");
  return [
    base + "/",
    base + "/investors",
    base + "/investor-relations",
    base + "/ir",
    base + "/shareholders",
    base + "/news",
    base + "/press-releases",
    base + "/events",
    base + "/financial-information",
  ].filter((u) => {
    try {
      return isSameDomain(u, origin);
    } catch {
      return false;
    }
  });
}

export async function crawlDomain(domainInput: string): Promise<CrawlResult> {
  let origin: string;
  if (domainInput.startsWith("http")) {
    const o = getOrigin(domainInput);
    if (!o) throw new Error("Invalid domain URL");
    origin = o;
  } else {
    origin = `https://${domainInput.replace(/^\/+/, "").split("/")[0]}`;
  }
  const originNorm = origin.replace(/\/$/, "");

  const robots = await fetchRobots(originNorm);
  await sleep(RATE_LIMIT_MS);

  const sitemap = await discoverAndParseSitemaps(originNorm);
  await sleep(RATE_LIMIT_MS);

  const pages: CrawlPage[] = [];
  const seen = new Set<string>();
  const toFetch: string[] = [];

  // Sitemap-first: add IR URLs and then other sitemap URLs up to limit
  const sitemapUrlsToUse = [
    ...sitemap.irUrls,
    ...sitemap.urls.filter((u) => !sitemap.irUrls.includes(u)),
  ].slice(0, MAX_PAGES_SITEMAP);

  for (const u of sitemapUrlsToUse) {
    try {
      const path = new URL(u).pathname;
      if (!isAllowedByRobots(path, robots)) continue;
      if (!seen.has(u)) {
        seen.add(u);
        toFetch.push(u);
      }
    } catch {
      continue;
    }
  }

  // If sitemap gave few or no URLs, add fallback seeds and do shallow crawl
  if (toFetch.length < 10) {
    const seeds = getFallbackSeeds(originNorm);
    for (const u of seeds) {
      if (!seen.has(u)) {
        seen.add(u);
        toFetch.push(u);
      }
    }
  }

  const urlsFromCrawl: string[] = [];
  const irUrlsFromCrawl: string[] = [];
  let fetched = 0;

  for (let i = 0; i < toFetch.length && fetched < MAX_PAGES_CRAWL; i++) {
    const url = toFetch[i];
    await sleep(RATE_LIMIT_MS);
    try {
      const { html, status, contentType } = await fetchWithRetry(url);
      if (status !== 200 || !html) continue;
      pages.push({ url, html, status, contentType });
      urlsFromCrawl.push(url);
      try {
        if (isLikelyIRPath(new URL(url).pathname)) irUrlsFromCrawl.push(url);
      } catch {
        // ignore
      }
      fetched++;

      // Fallback crawl: from this page, add links up to depth 3 (simplified: only add more to queue if we started from seeds)
      if (sitemap.urlCount < 5 && fetched <= 20) {
        const links = extractLinks(html, originNorm);
        for (const link of links) {
          if (seen.size >= MAX_PAGES_CRAWL) break;
          try {
            const path = new URL(link).pathname;
            if (!isAllowedByRobots(path, robots)) continue;
            if (!seen.has(link)) {
              seen.add(link);
              toFetch.push(link);
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      // skip failed page
    }
  }

  return {
    origin: originNorm,
    robots,
    sitemap,
    pages,
    urlsFromCrawl,
    irUrlsFromCrawl,
  };
}

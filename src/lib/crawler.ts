/**
 * Lightweight fetcher: phase 1 = homepage, /investor, robots, sitemap (4); phase 2 = up to 2
 * earnings-related links discovered from phase 1 HTML. Max 6 requests per domain, 8s timeout each.
 */

import * as cheerio from "cheerio";
import { getOrigin } from "./url-utils";
import type { RobotsResult } from "./robots";
import type { SitemapResult } from "./sitemap";

const FETCH_TIMEOUT_MS = 8000;
const MAX_PHASE1 = 4;
const MAX_FOLLOWUP = 2;
const USER_AGENT = "IR-AI-Readiness-Scanner/1.0";

/** Match anchors/URLs for earnings-related targets (deterministic). */
const EARNINGS_LINK_PATTERN = /earnings|results|quarterly|q1|q2|q3|q4|fy\d|press-release|release|webcast|replay|transcript|prepared-remarks|financials|quarter/i;

export interface CrawlPage {
  url: string;
  html: string;
  status: number;
  contentType: string;
  /** Response time in ms (optional). */
  responseTimeMs?: number;
  /** Last-Modified header value (optional). */
  lastModified?: string;
}

export interface CrawlResult {
  origin: string;
  robots: RobotsResult;
  sitemap: SitemapResult;
  pages: CrawlPage[];
  urlsFromCrawl: string[];
  irUrlsFromCrawl: string[];
}

function parseRobotsText(text: string): Omit<RobotsResult, "reachable" | "rawContent"> {
  const out = {
    disallowsInvestors: false,
    disallowsInvestorRelations: false,
    sitemapUrls: [] as string[],
  };
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let inRelevantGroup = false;
  for (const line of lines) {
    if (/^user-agent:\s*\*/i.test(line)) {
      inRelevantGroup = true;
      continue;
    }
    if (/^user-agent:/i.test(line) && !/^\s*\*/i.test(line.split(":")[1])) {
      inRelevantGroup = false;
    }
    if (inRelevantGroup) {
      const disallow = line.match(/^disallow:\s*(.+)/i);
      if (disallow) {
        const path = disallow[1].trim().toLowerCase();
        if (path.includes("investor") || path === "/investors" || path === "/investors/")
          out.disallowsInvestors = true;
        if (
          path.includes("investor-relations") ||
          path === "/investor-relations" ||
          path === "/investor-relations/"
        )
          out.disallowsInvestorRelations = true;
      }
      const sitemap = line.match(/^sitemap:\s*(.+)/i);
      if (sitemap) out.sitemapUrls.push(sitemap[1].trim());
    }
    const sitemap = line.match(/^sitemap:\s*(.+)/i);
    if (sitemap) out.sitemapUrls.push(sitemap[1].trim());
  }
  return out;
}

function parseSitemapXmlOnly(xml: string, origin: string): { urlCount: number; irUrlCount: number; urls: string[]; irUrls: string[] } {
  const urls: string[] = [];
  const irUrls: string[] = [];
  const irKeywords = ["investor", "ir", "shareholder", "financial", "sec", "news", "press", "event", "governance", "esg"];
  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    $("url loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (!loc) return;
      try {
        const u = new URL(loc);
        if (u.origin !== origin) return;
        urls.push(loc);
        const path = u.pathname.toLowerCase();
        if (irKeywords.some((k) => path.includes(k))) irUrls.push(loc);
      } catch {
        // skip
      }
    });
  } catch {
    // ignore
  }
  return { urlCount: urls.length, irUrlCount: irUrls.length, urls, irUrls };
}

function isIrPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower.includes("investor") ||
    lower.includes("/ir") ||
    lower === "/ir" ||
    lower.includes("investor-relations")
  );
}

/** Extract earnings-related links from HTML; return absolute URLs same-origin, ranked by relevance (deterministic). */
function extractEarningsCandidates(html: string, baseOrigin: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const scored: { url: string; score: number }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    const linkText = ($(el).text() || "").replace(/\s+/g, " ").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    try {
      const url = new URL(href, baseOrigin);
      if (url.origin !== baseOrigin) return;
      const full = url.href;
      if (seen.has(full)) return;
      const combined = (url.pathname + " " + url.search + " " + linkText).toLowerCase();
      if (!EARNINGS_LINK_PATTERN.test(combined)) return;
      seen.add(full);
      let score = 0;
      if (/earnings|quarterly|results|q[1-4]|financials/i.test(combined)) score += 3;
      if (/webcast|replay|transcript|press-release|release/i.test(combined)) score += 2;
      if (/\.pdf|presentation|slide/i.test(combined)) score += 1;
      scored.push({ url: full, score });
    } catch {
      // skip invalid URL
    }
  });
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.url.localeCompare(b.url)));
  return scored.map((s) => s.url).slice(0, 5);
}

async function fetchOne(
  url: string,
  acceptHtmlOnly: boolean
): Promise<{
  status: number;
  contentType: string;
  body: string;
  responseTimeMs: number;
  lastModified: string | null;
}> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - start;
    const contentType = res.headers.get("content-type") || "";
    const lastModified = res.headers.get("last-modified");
    const body = await res.text();
    if (acceptHtmlOnly && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { status: res.status, contentType, body: "", responseTimeMs, lastModified };
    }
    return { status: res.status, contentType, body, responseTimeMs, lastModified };
  } catch (e) {
    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - start;
    return {
      status: 0,
      contentType: "",
      body: "",
      responseTimeMs,
      lastModified: null,
    };
  }
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
  const base = origin.replace(/\/$/, "");

  const phase1Urls: { url: string; acceptHtmlOnly: boolean }[] = [
    { url: `${base}/`, acceptHtmlOnly: true },
    { url: `${base}/robots.txt`, acceptHtmlOnly: false },
    { url: `${base}/sitemap.xml`, acceptHtmlOnly: false },
    { url: `${base}/investor`, acceptHtmlOnly: true },
  ].slice(0, MAX_PHASE1);

  const robots: RobotsResult = {
    reachable: false,
    disallowsInvestors: false,
    disallowsInvestorRelations: false,
    rawContent: null,
    sitemapUrls: [],
  };

  let sitemap: SitemapResult = {
    reachable: false,
    urlCount: 0,
    irUrlCount: 0,
    urls: [],
    irUrls: [],
    childSitemaps: [],
  };

  const pages: CrawlPage[] = [];
  const urlsFromCrawl: string[] = [];
  const irUrlsFromCrawl: string[] = [];
  const htmlByUrl = new Map<string, string>();

  const phase1Results = await Promise.all(
    phase1Urls.map(({ url, acceptHtmlOnly }) =>
      fetchOne(url, acceptHtmlOnly).then((r) => ({ url, acceptHtmlOnly, ...r }))
    )
  );

  for (const { url, acceptHtmlOnly, status, contentType, body, responseTimeMs, lastModified } of phase1Results) {
    if (url.endsWith("/robots.txt")) {
      if (status === 200 && body) {
        robots.reachable = true;
        robots.rawContent = body;
        const parsed = parseRobotsText(body);
        robots.disallowsInvestors = parsed.disallowsInvestors;
        robots.disallowsInvestorRelations = parsed.disallowsInvestorRelations;
        robots.sitemapUrls = parsed.sitemapUrls;
      }
      continue;
    }

    if (url.endsWith("/sitemap.xml") || url.endsWith("sitemap.xml")) {
      if (status === 200 && body) {
        const parsed = parseSitemapXmlOnly(body, origin);
        sitemap = {
          reachable: true,
          urlCount: parsed.urlCount,
          irUrlCount: parsed.irUrlCount,
          urls: parsed.urls,
          irUrls: parsed.irUrls,
          childSitemaps: [],
        };
      }
      continue;
    }

    if (acceptHtmlOnly && (contentType.includes("text/html") || contentType.includes("application/xhtml")) && body) {
      htmlByUrl.set(url, body);
      pages.push({
        url,
        html: body,
        status,
        contentType,
        responseTimeMs,
        lastModified: lastModified ?? undefined,
      });
      urlsFromCrawl.push(url);
      try {
        if (isIrPath(new URL(url).pathname)) irUrlsFromCrawl.push(url);
      } catch {
        // ignore
      }
    }
  }

  const alreadyFetched = new Set(pages.map((p) => p.url));
  const followCandidates: string[] = [];
  for (const [, html] of htmlByUrl) {
    followCandidates.push(...extractEarningsCandidates(html, base));
  }
  const followUrls = [...new Set(followCandidates)]
    .filter((u) => !alreadyFetched.has(u))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_FOLLOWUP);

  if (followUrls.length > 0) {
    const phase2Results = await Promise.all(
      followUrls.map((url) => fetchOne(url, true).then((r) => ({ url, ...r })))
    );
    for (const { url, status, contentType, body, responseTimeMs, lastModified } of phase2Results) {
      if (status === 200 && body && (contentType.includes("text/html") || contentType.includes("application/xhtml"))) {
        pages.push({
          url,
          html: body,
          status,
          contentType,
          responseTimeMs,
          lastModified: lastModified ?? undefined,
        });
        urlsFromCrawl.push(url);
        try {
          if (isIrPath(new URL(url).pathname)) irUrlsFromCrawl.push(url);
        } catch {
          // ignore
        }
      }
    }
  }

  return {
    origin: base,
    robots,
    sitemap,
    pages,
    urlsFromCrawl,
    irUrlsFromCrawl,
  };
}

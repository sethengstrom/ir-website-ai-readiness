/**
 * Lightweight fetcher for sales-demo: no deep crawl, no sitemap traversal.
 * Fetches only: homepage, /investor, /ir, robots.txt, sitemap.xml.
 * All 5 requests per domain run in parallel so total time fits within serverless limits (e.g. 10s).
 */

import * as cheerio from "cheerio";
import { getOrigin } from "./url-utils";
import type { RobotsResult } from "./robots";
import type { SitemapResult } from "./sitemap";

const FETCH_TIMEOUT_MS = 5000;
const MAX_REQUESTS_PER_DOMAIN = 5;
const USER_AGENT = "IR-AI-Readiness-Scanner/1.0";

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

  const urlsToFetch: { url: string; acceptHtmlOnly: boolean }[] = [
    { url: `${base}/`, acceptHtmlOnly: true },
    { url: `${base}/robots.txt`, acceptHtmlOnly: false },
    { url: `${base}/sitemap.xml`, acceptHtmlOnly: false },
    { url: `${base}/investor`, acceptHtmlOnly: true },
    { url: `${base}/ir`, acceptHtmlOnly: true },
  ].slice(0, MAX_REQUESTS_PER_DOMAIN);

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

  // Fetch all URLs in parallel so total time ~= single slow request (~5s), not 5× sequential
  const results = await Promise.all(
    urlsToFetch.map(({ url, acceptHtmlOnly }) =>
      fetchOne(url, acceptHtmlOnly).then((r) => ({ url, acceptHtmlOnly, ...r }))
    )
  );

  for (const { url, acceptHtmlOnly, status, contentType, body, responseTimeMs, lastModified } of results) {
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

  return {
    origin: base,
    robots,
    sitemap,
    pages,
    urlsFromCrawl,
    irUrlsFromCrawl,
  };
}

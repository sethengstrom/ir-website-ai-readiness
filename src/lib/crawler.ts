/**
 * Two-phase fetcher aligned with common IR site patterns:
 * Phase 1: homepage, robots.txt, sitemap.xml, and one IR URL—either the user-provided path (e.g. /overview/default.aspx),
 * or /investors for IR subdomains (investor.*, ir.*, investors.*), else /investor. If sitemap.xml isn't at root, we try
 * the first Sitemap: URL from robots.txt. Phase 2: up to 2 earnings/events/presentations links from phase-1 HTML.
 * Max 6–7 requests per domain (7 when sitemap fallback is used), 12s timeout each.
 */

import * as cheerio from "cheerio";
import { getOrigin, isLikelyIRPath } from "./url-utils";
import type { RobotsResult } from "./robots";
import type { SitemapResult } from "./sitemap";

/** Per-request timeout; slow IR sites may need 12s to respond. */
const FETCH_TIMEOUT_MS = 12000;
const MAX_PHASE1 = 4;
const MAX_FOLLOWUP = 2;
/** Browser-like UA so IR sites (e.g. Ciena) don't block or throttle server requests. */
const USER_AGENT =
  "Mozilla/5.0 (compatible; IR-AI-Readiness-Scanner/1.0; +https://github.com/ir-ai-readiness) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
const RETRY_MAX = 2;
const RETRY_BASE_MS = 500;
/** Max response body size (2MB) to avoid OOM on very large pages. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read response body up to maxBytes to avoid OOM on very large responses. */
async function readTextWithLimit(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        const take = value.length - (total - maxBytes);
        chunks.push(value.subarray(0, take));
        break;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buf = Buffer.concat(chunks);
  return new TextDecoder().decode(buf);
}

/** Match anchors/URLs for earnings-related targets (deterministic). Include events and presentations (common on IR sites). */
const EARNINGS_LINK_PATTERN = /earnings|results|quarterly|q1|q2|q3|q4|fy\d|press-release|release|webcast|replay|transcript|prepared-remarks|financials|quarter|events|presentations/i;

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
  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    $("url loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (!loc) return;
      try {
        const u = new URL(loc);
        if (u.origin !== origin) return;
        urls.push(loc);
        if (isLikelyIRPath(u.pathname)) irUrls.push(loc);
      } catch {
        // skip
      }
    });
  } catch {
    // ignore
  }
  return { urlCount: urls.length, irUrlCount: irUrls.length, urls, irUrls };
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
      if (/webcast|replay|transcript|press-release|release|events/i.test(combined)) score += 2;
      if (/\.pdf|presentation|slide|presentations/i.test(combined)) score += 1;
      scored.push({ url: full, score });
    } catch {
      // skip invalid URL
    }
  });
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.url.localeCompare(b.url)));
  return scored.map((s) => s.url).slice(0, 5);
}

function shouldRetry(status: number): boolean {
  return status === 0 || (status >= 500 && status <= 599);
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
  let lastResult: {
    status: number;
    contentType: string;
    body: string;
    responseTimeMs: number;
    lastModified: string | null;
  } = {
    status: 0,
    contentType: "",
    body: "",
    responseTimeMs: 0,
    lastModified: null,
  };

  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    if (attempt > 0) {
      const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await sleep(backoffMs);
    }
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { "User-Agent": USER_AGENT };
      if (acceptHtmlOnly) headers["Accept"] = "text/html,application/xhtml+xml";
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      const responseTimeMs = Date.now() - start;
      const contentType = res.headers.get("content-type") || "";
      const lastModified = res.headers.get("last-modified");
      const body = await readTextWithLimit(res, MAX_BODY_BYTES);
      clearTimeout(timeoutId);
      lastResult = {
        status: res.status,
        contentType,
        body: res.ok ? body : "",
        responseTimeMs,
        lastModified,
      };
      if (!shouldRetry(res.status)) return lastResult;
    } catch {
      clearTimeout(timeoutId);
      lastResult = {
        status: 0,
        contentType: "",
        body: "",
        responseTimeMs: Date.now() - start,
        lastModified: null,
      };
    }
  }
  return lastResult;
}

function emptyCrawlResult(origin: string): CrawlResult {
  const base = origin.replace(/\/$/, "");
  return {
    origin: base,
    robots: { reachable: false, disallowsInvestors: false, disallowsInvestorRelations: false, rawContent: null, sitemapUrls: [] },
    sitemap: { reachable: false, urlCount: 0, irUrlCount: 0, urls: [], irUrls: [], childSitemaps: [] },
    pages: [],
    urlsFromCrawl: [],
    irUrlsFromCrawl: [],
  };
}

/** True if the hostname looks like an IR subdomain (investor., ir., investors.). */
function isIRSubdomain(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h.startsWith("investor.") || h.startsWith("ir.") || h.startsWith("investors.");
}

export async function crawlDomain(domainInput: string): Promise<CrawlResult> {
  let origin: string;
  let userPath: string | null = null;
  if (domainInput.startsWith("http")) {
    const o = getOrigin(domainInput);
    if (!o) throw new Error("Invalid domain URL");
    origin = o;
    try {
      const parsed = new URL(domainInput);
      const p = parsed.pathname.replace(/\/+/g, "/").trim();
      if (p && p !== "/") userPath = p.startsWith("/") ? p : `/${p}`;
    } catch {
      // ignore
    }
  } else {
    origin = `https://${domainInput.replace(/^\/+/, "").split("/")[0]}`;
  }
  const base = origin.replace(/\/$/, "");
  const hostname = (() => {
    try {
      return new URL(origin).hostname;
    } catch {
      return "";
    }
  })();

  // Fourth HTML URL: user-provided path (e.g. /overview/default.aspx) or conventional IR path.
  // IR subdomains (investor.X, ir.X, investors.X) often use /investors for a subsection; main domains often use /investor or /investors.
  const fourthHtmlUrl =
    userPath !== null
      ? `${base}${userPath}`
      : isIRSubdomain(hostname)
        ? `${base}/investors`
        : `${base}/investor`;

  try {
  const phase1Urls: { url: string; acceptHtmlOnly: boolean }[] = [
    { url: `${base}/`, acceptHtmlOnly: true },
    { url: `${base}/robots.txt`, acceptHtmlOnly: false },
    { url: `${base}/sitemap.xml`, acceptHtmlOnly: false },
    { url: fourthHtmlUrl, acceptHtmlOnly: true },
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

  const phase1Settled = await Promise.allSettled(
    phase1Urls.map(({ url, acceptHtmlOnly }) =>
      fetchOne(url, acceptHtmlOnly).then((r) => ({ url, acceptHtmlOnly, ...r }))
    )
  );
  const phase1Results = phase1Settled.map((p) =>
    p.status === "fulfilled" ? p.value : { url: "", acceptHtmlOnly: false, status: 0, contentType: "", body: "", responseTimeMs: 0, lastModified: null }
  );
  // Reattach url/acceptHtmlOnly for entries that failed so we can skip them
  phase1Urls.forEach((u, i) => {
    if (phase1Settled[i].status === "fulfilled") return;
    (phase1Results[i] as { url: string; acceptHtmlOnly: boolean }).url = u.url;
    (phase1Results[i] as { url: string; acceptHtmlOnly: boolean }).acceptHtmlOnly = u.acceptHtmlOnly;
  });

  for (const { url, acceptHtmlOnly, status, contentType, body, responseTimeMs, lastModified } of phase1Results) {
    if (!url) continue;
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
        if (isLikelyIRPath(new URL(url).pathname)) irUrlsFromCrawl.push(url);
      } catch {
        // ignore
      }
    }
  }

  // If sitemap.xml wasn't at the default path, try first sitemap URL from robots.txt (common on IR sites).
  if (!sitemap.reachable && robots.sitemapUrls.length > 0) {
    const firstSitemapUrl = robots.sitemapUrls[0];
    try {
      const sitemapRes = await fetchOne(firstSitemapUrl, false);
      if (sitemapRes.status === 200 && sitemapRes.body && /<\?xml|<\/urlset|<\/sitemapindex/i.test(sitemapRes.body)) {
        const parsed = parseSitemapXmlOnly(sitemapRes.body, origin);
        sitemap = {
          reachable: true,
          urlCount: parsed.urlCount,
          irUrlCount: parsed.irUrlCount,
          urls: parsed.urls,
          irUrls: parsed.irUrls,
          childSitemaps: [],
        };
      }
    } catch {
      // ignore
    }
  }

  const alreadyFetched = new Set(pages.map((p) => p.url));
  const followCandidates: string[] = [];
  // Iterate phase-1 HTML in stable URL order so phase-2 link selection is deterministic for the same content.
  const phase1HtmlUrls = [...htmlByUrl.keys()].sort((a, b) => a.localeCompare(b));
  for (const url of phase1HtmlUrls) {
    const html = htmlByUrl.get(url);
    if (html) followCandidates.push(...extractEarningsCandidates(html, base));
  }
  const followUrls = [...new Set(followCandidates)]
    .filter((u) => !alreadyFetched.has(u))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_FOLLOWUP);

  if (followUrls.length > 0) {
    const phase2Settled = await Promise.allSettled(
      followUrls.map((url) => fetchOne(url, true).then((r) => ({ url, ...r })))
    );
    for (let i = 0; i < phase2Settled.length; i++) {
      const p = phase2Settled[i];
      const { url, status, contentType, body, responseTimeMs, lastModified } =
        p.status === "fulfilled" ? p.value : { url: followUrls[i], status: 0, contentType: "", body: "", responseTimeMs: 0, lastModified: null };
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
          if (isLikelyIRPath(new URL(url).pathname)) irUrlsFromCrawl.push(url);
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
  } catch (e) {
    console.error("[crawler] crawlDomain error for", base, e);
    return emptyCrawlResult(origin);
  }
}

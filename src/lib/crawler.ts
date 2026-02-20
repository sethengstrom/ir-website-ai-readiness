/**
 * Two-phase fetcher aligned with common IR site patterns.
 * Phase 1a: homepage, robots.txt, sitemap.xml (3 requests). We then discover the IR entry URL from the site itself:
 * - User-provided path (if they pasted a full URL), or
 * - IR-looking links in the homepage's server-rendered nav (text, href, title, aria-label), or
 * - IR URLs from the sitemap (when available), or
 * - Conventional guess (/investors for IR subdomains, else /investor).
 * Phase 1b: fetch the chosen IR URL (and if it fails, one fallback path). If sitemap wasn't at root, we try the first
 * Sitemap: from robots so discovery can use sitemap IR URLs when possible.
 * Phase 2: up to MAX_FOLLOWUP earnings/events/presentations links from phase-1 HTML.
 * More thorough: longer per-request timeout, more IR pages when discovery yields multiple, more phase-2 follow-ups.
 */

import * as cheerio from "cheerio";
import { getOrigin, isLikelyIRPath } from "./url-utils";
import type { RobotsResult } from "./robots";
import type { SitemapResult } from "./sitemap";

/** Link text/aria/label phrases that strongly indicate an IR section (for ranking nav-discovered links). */
const IR_NAV_PHRASES = [
  "investor relations",
  "investor relation",
  "for investors",
  "investors",
  " ir ",
  "ir/",
  "/ir",
  "shareholders",
  "shareholder",
  "financial information",
  "stock information",
];

/** Paths that look like the main IR landing (prefer when multiple candidates). */
function pathLooksCanonicalIR(pathname: string): boolean {
  const p = pathname.toLowerCase().replace(/\/$/, "") || "/";
  return (
    p === "/investor" ||
    p === "/investors" ||
    p === "/investor-relations" ||
    p === "/ir" ||
    p === "/"
  );
}

/**
 * Extract same-origin links from HTML that look like IR section links. Uses link text, href, title, and aria-label.
 * Returns absolute URLs ranked by relevance (canonical path > IR phrasing in text > path matches IR keywords).
 */
function extractIRLinksFromHtml(html: string, baseOrigin: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const scored: { url: string; score: number; pathLen: number }[] = [];
  const base = baseOrigin.replace(/\/$/, "");

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    const text = ($(el).text() || "").replace(/\s+/g, " ").trim().toLowerCase();
    const title = (($(el).attr("title") || "").replace(/\s+/g, " ").trim()).toLowerCase();
    const ariaLabel = (($(el).attr("aria-label") || "").replace(/\s+/g, " ").trim()).toLowerCase();
    const combined = `${text} ${title} ${ariaLabel} ${href}`.toLowerCase();

    try {
      const url = new URL(href, baseOrigin);
      if (url.origin !== base) return;
      url.hash = "";
      const pathname = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
      const full = url.href;
      if (seen.has(full)) return;

      const hasIRPhrase = IR_NAV_PHRASES.some((phrase) =>
        combined.includes(phrase) || pathname.includes(phrase.trim())
      );
      if (!hasIRPhrase && !isLikelyIRPath(pathname)) return;

      seen.add(full);
      let score = 0;
      if (pathLooksCanonicalIR(pathname)) score += 3;
      if (/investor\s*relations?|for\s*investors|\binvestors\b|\bir\b|shareholder|financial\s*info/i.test(combined)) score += 2;
      if (isLikelyIRPath(pathname)) score += 1;
      const pathLen = pathname.split("/").filter(Boolean).length;
      scored.push({ url: full, score, pathLen });
    } catch {
      // skip invalid URL
    }
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.pathLen !== b.pathLen) return a.pathLen - b.pathLen;
    return a.url.localeCompare(b.url);
  });
  return scored.map((s) => s.url);
}

/**
 * Pick the best IR URL from sitemap's irUrls: prefer canonical landing paths, then shorter paths.
 */
function pickBestSitemapIRUrl(irUrls: string[], origin: string): string | null {
  if (irUrls.length === 0) return null;
  const base = origin.replace(/\/$/, "");
  const scored: { url: string; canonical: number; pathLen: number }[] = [];
  for (const raw of irUrls) {
    try {
      const url = new URL(raw);
      if (url.origin !== base) continue;
      const pathname = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
      const canonical = pathLooksCanonicalIR(pathname) ? 1 : 0;
      const pathLen = pathname.split("/").filter(Boolean).length;
      scored.push({ url: url.href, canonical, pathLen });
    } catch {
      // skip
    }
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (b.canonical !== a.canonical) return b.canonical - a.canonical;
    if (a.pathLen !== b.pathLen) return a.pathLen - b.pathLen;
    return a.url.localeCompare(b.url);
  });
  return scored[0].url;
}

/** Per-request timeout; allow slow IR sites more time to respond. */
const FETCH_TIMEOUT_MS = 25000;
/** Phase 1a: home, robots, sitemap only. IR URL(s) chosen by discovery then fetched separately. */
const PHASE1A_COUNT = 3;
/** Max number of additional IR entry pages to fetch when discovery yields multiple (e.g. nav + sitemap). */
const MAX_IR_PAGES = 3;
/** Max earnings/events/presentations links to fetch in phase 2 (aim for ~20s scan time with more accurate results). */
const MAX_FOLLOWUP = 20;
/** Same-origin IR paths to probe for Notified NIR fingerprint (final URL checked even on 403). */
const FORCED_PROBE_PATHS = [
  "/sec-filings?order=field_nir_sec_form&sort=asc&items_per_page=10&mobile=1",
  "/press-releases",
  "/events-and-presentations",
  "/financial-information",
];
/** Browser header profiles: try Chrome then Safari (and optionally Firefox) to avoid 403 on Notified etc. */
const BROWSER_HEADER_PROFILES: ReadonlyArray<Record<string, string>> = [
  {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  },
  {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  },
];
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

/** Per-page fetch outcome for diagnostics and fallbacks. */
export type FetchQuality = "OK" | "JS-shell" | "blocked";

export interface CrawlPage {
  url: string;
  html: string;
  status: number;
  contentType: string;
  /** Response time in ms (optional). */
  responseTimeMs?: number;
  /** Last-Modified header value (optional). */
  lastModified?: string;
  /** Fetch outcome: OK, JS-shell (SPA shell with little server-rendered content), or blocked. */
  fetchQuality?: FetchQuality;
  /** Final URL after redirects (when available). */
  finalUrl?: string;
}

/** Result of probing a path (e.g. forced Notified probe); final URL used for NIR fingerprint even on 403. */
export interface ProbedUrl {
  requested: string;
  finalUrl: string;
  status: number;
}

export interface CrawlResult {
  origin: string;
  robots: RobotsResult;
  sitemap: SitemapResult;
  pages: CrawlPage[];
  urlsFromCrawl: string[];
  irUrlsFromCrawl: string[];
  /** Final URL of the first HTML page after redirects (when available). */
  firstPageFinalUrl?: string;
  /** Forced probe of same-origin IR paths; final URLs used for Notified NIR detection even when fetch fails. */
  probedFinalUrls?: ProbedUrl[];
}

/** Optional progress callback for UI updates during crawl. */
export interface CrawlOptions {
  onProgress?: (message: string) => void;
}

function parseRobotsText(text: string): Omit<RobotsResult, "reachable" | "rawContent"> {
  const out = {
    disallowsInvestors: false,
    disallowsInvestorRelations: false,
    disallowsInvestor: false,
    disallowsIr: false,
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
        if (path === "/investor" || path === "/investor/" || (path.startsWith("/investor/") && !path.startsWith("/investors")))
          out.disallowsInvestor = true;
        if (path === "/ir" || path === "/ir/" || path.startsWith("/ir/"))
          out.disallowsIr = true;
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
  return scored.map((s) => s.url).slice(0, 28);
}

function shouldRetry(status: number): boolean {
  return status === 0 || (status >= 500 && status <= 599);
}

/** Classify fetch outcome for diagnostics and fallbacks. */
function getFetchQuality(status: number, body: string): FetchQuality {
  if (status === 0 || status === 403 || status === 502 || status === 503) return "blocked";
  if (status !== 200 || !body) return "blocked";
  const $ = cheerio.load(body);
  const bodyText = $("body").text()?.replace(/\s+/g, " ").trim() || "";
  const scriptLen = ($("script").text() || "").length;
  if (bodyText.length < 400 && body.length > 2000) return "JS-shell";
  if (bodyText.length < 300 && scriptLen > 1000) return "JS-shell";
  return "OK";
}

export type FetchOneResult = {
  status: number;
  contentType: string;
  body: string;
  responseTimeMs: number;
  lastModified: string | null;
  finalUrl: string;
};

async function fetchOneWithHeaders(
  url: string,
  acceptHtmlOnly: boolean,
  headerProfile: Record<string, string>
): Promise<FetchOneResult> {
  let lastResult: FetchOneResult = {
    status: 0,
    contentType: "",
    body: "",
    responseTimeMs: 0,
    lastModified: null,
    finalUrl: url,
  };

  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { ...headerProfile };
      if (acceptHtmlOnly) headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
      const res = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
      const responseTimeMs = Date.now() - start;
      const contentType = res.headers.get("content-type") || "";
      const lastModified = res.headers.get("last-modified");
      const body = await readTextWithLimit(res, MAX_BODY_BYTES);
      const finalUrl = res.url || url;
      clearTimeout(timeoutId);
      lastResult = {
        status: res.status,
        contentType,
        body: res.ok ? body : "",
        responseTimeMs,
        lastModified,
        finalUrl,
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
        finalUrl: url,
      };
    }
  }
  return lastResult;
}

/** Fetch with browser-like headers; on 403 try next profile (Chrome → Safari) up to 2–3 before declaring blocked. */
async function fetchOne(url: string, acceptHtmlOnly: boolean): Promise<FetchOneResult> {
  let last = await fetchOneWithHeaders(url, acceptHtmlOnly, BROWSER_HEADER_PROFILES[0]);
  for (let i = 1; i < BROWSER_HEADER_PROFILES.length && (last.status === 403 || last.status === 0); i++) {
    last = await fetchOneWithHeaders(url, acceptHtmlOnly, BROWSER_HEADER_PROFILES[i]);
    if (last.status !== 403 && last.status !== 0) return last;
  }
  return last;
}

function emptyCrawlResult(origin: string): CrawlResult {
  const base = origin.replace(/\/$/, "");
  return {
    origin: base,
    robots: { reachable: false, disallowsInvestors: false, disallowsInvestorRelations: false, disallowsInvestor: false, disallowsIr: false, rawContent: null, sitemapUrls: [] },
    sitemap: { reachable: false, urlCount: 0, irUrlCount: 0, urls: [], irUrls: [], childSitemaps: [] },
    pages: [],
    urlsFromCrawl: [],
    irUrlsFromCrawl: [],
  };
}

/** True if the hostname looks like an IR subdomain (investor., ir., investors., stock.). */
function isIRSubdomain(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h.startsWith("investor.") || h.startsWith("ir.") || h.startsWith("investors.") || h.startsWith("stock.");
}

export async function crawlDomain(domainInput: string, options?: CrawlOptions): Promise<CrawlResult> {
  const onProgress = options?.onProgress;
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

  try {
  onProgress?.("Fetching homepage, robots.txt & sitemap…");
  const phase1aUrls: { url: string; acceptHtmlOnly: boolean }[] = [
    { url: `${base}/`, acceptHtmlOnly: true },
    { url: `${base}/robots.txt`, acceptHtmlOnly: false },
    { url: `${base}/sitemap.xml`, acceptHtmlOnly: false },
  ].slice(0, PHASE1A_COUNT);

  const robots: RobotsResult = {
    reachable: false,
    disallowsInvestors: false,
    disallowsInvestorRelations: false,
    disallowsInvestor: false,
    disallowsIr: false,
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

  const phase1aSettled = await Promise.allSettled(
    phase1aUrls.map(({ url, acceptHtmlOnly }) =>
      fetchOne(url, acceptHtmlOnly).then((r) => ({ url, acceptHtmlOnly, ...r }))
    )
  );
  const phase1aResults = phase1aSettled.map((p) =>
    p.status === "fulfilled" ? p.value : { url: "", acceptHtmlOnly: false, status: 0, contentType: "", body: "", responseTimeMs: 0, lastModified: null, finalUrl: "" }
  );
  phase1aUrls.forEach((u, i) => {
    if (phase1aSettled[i].status === "fulfilled") return;
    (phase1aResults[i] as { url: string; acceptHtmlOnly: boolean }).url = u.url;
    (phase1aResults[i] as { url: string; acceptHtmlOnly: boolean }).acceptHtmlOnly = u.acceptHtmlOnly;
  });

  for (const { url, acceptHtmlOnly, status, contentType, body, responseTimeMs, lastModified, finalUrl } of phase1aResults) {
    if (!url) continue;
    if (url.endsWith("/robots.txt")) {
      if (status === 200 && body) {
        robots.reachable = true;
        robots.rawContent = body;
        const parsed = parseRobotsText(body);
        robots.disallowsInvestors = parsed.disallowsInvestors;
        robots.disallowsInvestorRelations = parsed.disallowsInvestorRelations;
        robots.disallowsInvestor = parsed.disallowsInvestor;
        robots.disallowsIr = parsed.disallowsIr;
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
        fetchQuality: getFetchQuality(status, body),
        finalUrl: finalUrl || undefined,
      });
      urlsFromCrawl.push(url);
      try {
        if (isLikelyIRPath(new URL(url).pathname)) irUrlsFromCrawl.push(url);
      } catch {
        // ignore
      }
    }
  }

  onProgress?.("Parsing sitemap & discovering IR pages…");
  // If sitemap wasn't at root, try first Sitemap: from robots so we have irUrls for discovery.
  if (!sitemap.reachable && robots.sitemapUrls.length > 0) {
    onProgress?.("Checking sitemap from robots.txt…");
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

  // Discover IR entry URL(s): user path > homepage nav links > sitemap IR URLs > conventional guess. Fetch up to MAX_IR_PAGES.
  const homeUrl = `${base}/`;
  const homeHtml = htmlByUrl.get(homeUrl);
  const irUrlsToFetch: string[] = [];
  if (userPath !== null) {
    irUrlsToFetch.push(`${base}${userPath}`);
  } else {
    const fromNav = homeHtml ? extractIRLinksFromHtml(homeHtml, base) : [];
    const navFirst = fromNav[0];
    const sitemapFirst = pickBestSitemapIRUrl(sitemap.irUrls, base);
    const first = navFirst ?? sitemapFirst ?? (isIRSubdomain(hostname) ? `${base}/investors` : `${base}/investor`);
    irUrlsToFetch.push(first);
    if (fromNav[1] && fromNav[1] !== first && irUrlsToFetch.length < MAX_IR_PAGES) irUrlsToFetch.push(fromNav[1]);
    // Common Q4 IR landing path; fetch so we can detect Q4 hosting (e.g. Costco has q4cdn here).
    const overviewUrl = `${base}/overview/default.aspx`;
    if (irUrlsToFetch.length < MAX_IR_PAGES && !irUrlsToFetch.some((u) => u === overviewUrl || u.replace(/\/$/, "") === overviewUrl.replace(/\/$/, ""))) {
      irUrlsToFetch.push(overviewUrl);
    }
  }

  onProgress?.("Fetching IR entry pages…");
  let firstIrAttempted: string | null = null;
  let firstIrResult: FetchOneResult | null = null;
  for (const irUrl of irUrlsToFetch) {
    if (htmlByUrl.has(irUrl)) continue;
    try {
      const irRes = await fetchOne(irUrl, true);
      if (firstIrAttempted === null) {
        firstIrAttempted = irUrl;
        firstIrResult = irRes;
      }
      if (
        irRes.status === 200 &&
        irRes.body &&
        (irRes.contentType.includes("text/html") || irRes.contentType.includes("application/xhtml"))
      ) {
        htmlByUrl.set(irUrl, irRes.body);
        pages.push({
          url: irUrl,
          html: irRes.body,
          status: irRes.status,
          contentType: irRes.contentType,
          responseTimeMs: irRes.responseTimeMs,
          lastModified: irRes.lastModified ?? undefined,
          fetchQuality: getFetchQuality(irRes.status, irRes.body),
          finalUrl: irRes.finalUrl || undefined,
        });
        urlsFromCrawl.push(irUrl);
        try {
          if (isLikelyIRPath(new URL(irUrl).pathname)) irUrlsFromCrawl.push(irUrl);
        } catch {
          // ignore
        }
      } else if (irUrl === firstIrAttempted && pages.length === 0) {
        pages.push({
          url: irUrl,
          html: "",
          status: irRes.status,
          contentType: irRes.contentType,
          responseTimeMs: irRes.responseTimeMs,
          lastModified: irRes.lastModified ?? undefined,
          fetchQuality: irRes.status === 403 || irRes.status === 0 ? "blocked" : "blocked",
          finalUrl: irRes.finalUrl || undefined,
        });
      }
    } catch {
      // ignore
    }
  }

  // If the first IR URL failed and we didn't use a user path, try one fallback path.
  const firstIrUrl = irUrlsToFetch[0];
  if (firstIrUrl && !htmlByUrl.has(firstIrUrl) && userPath === null) {
    const fallbackPath =
      firstIrUrl.endsWith("/investors") || firstIrUrl.endsWith("/investors/")
        ? `${base}/investor`
        : firstIrUrl.endsWith("/investor") || firstIrUrl.endsWith("/investor/")
          ? `${base}/investor-relations`
          : null;
    if (fallbackPath && fallbackPath !== firstIrUrl) {
      try {
        const fallbackRes = await fetchOne(fallbackPath, true);
        if (
          fallbackRes.status === 200 &&
          fallbackRes.body &&
          (fallbackRes.contentType.includes("text/html") || fallbackRes.contentType.includes("application/xhtml"))
        ) {
          htmlByUrl.set(fallbackPath, fallbackRes.body);
          pages.push({
            url: fallbackPath,
            html: fallbackRes.body,
            status: fallbackRes.status,
            contentType: fallbackRes.contentType,
            responseTimeMs: fallbackRes.responseTimeMs,
            lastModified: fallbackRes.lastModified ?? undefined,
            fetchQuality: getFetchQuality(fallbackRes.status, fallbackRes.body),
            finalUrl: fallbackRes.finalUrl || undefined,
          });
          urlsFromCrawl.push(fallbackPath);
          try {
            if (isLikelyIRPath(new URL(fallbackPath).pathname)) irUrlsFromCrawl.push(fallbackPath);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
  }

  const alreadyFetched = new Set(pages.map((p) => p.url));
  const followCandidates: string[] = [];
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
    const total = followUrls.length;
    for (let i = 0; i < followUrls.length; i++) {
      onProgress?.(`Fetching earnings & events link ${i + 1} of ${total}…`);
      const url = followUrls[i];
      try {
        const r = await fetchOne(url, true);
        if (
          r.status === 200 &&
          r.body &&
          (r.contentType.includes("text/html") || r.contentType.includes("application/xhtml"))
        ) {
          pages.push({
            url,
            html: r.body,
            status: r.status,
            contentType: r.contentType,
            responseTimeMs: r.responseTimeMs,
            lastModified: r.lastModified ?? undefined,
            fetchQuality: getFetchQuality(r.status, r.body),
            finalUrl: r.finalUrl || undefined,
          });
          urlsFromCrawl.push(url);
          try {
            if (isLikelyIRPath(new URL(url).pathname)) irUrlsFromCrawl.push(url);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
  }

  onProgress?.("Probing Notified IR paths (final URL for NIR fingerprint)…");
  const probedFinalUrls: ProbedUrl[] = [];
  for (const path of FORCED_PROBE_PATHS) {
    const probeUrl = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    try {
      const r = await fetchOne(probeUrl, true);
      probedFinalUrls.push({ requested: probeUrl, finalUrl: r.finalUrl || probeUrl, status: r.status });
    } catch {
      probedFinalUrls.push({ requested: probeUrl, finalUrl: probeUrl, status: 0 });
    }
  }

  onProgress?.(`Crawl complete. ${pages.length} pages fetched.`);

  return {
    origin: base,
    robots,
    sitemap,
    pages,
    urlsFromCrawl,
    irUrlsFromCrawl,
    firstPageFinalUrl: pages[0]?.finalUrl ?? pages[0]?.url ?? firstIrResult?.finalUrl ?? undefined,
    probedFinalUrls,
  };
  } catch (e) {
    console.error("[crawler] crawlDomain error for", base, e);
    return emptyCrawlResult(origin);
  }
}

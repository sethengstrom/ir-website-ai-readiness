/**
 * Deterministic detection of IR site hosting provider and tools/feeds provider.
 * Classifies pages as core (index + same-origin IR pages) vs tools (stock, SEC, filings).
 * Uses full HTML, footer and footer-equivalent text, and asset/script/link URL hostnames.
 */

import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { IrHostingResult, IrHostProvider, ToolsFeedsProvider } from "../types";
import { isLikelyIRPath } from "../url-utils";
import type { ProbedUrl } from "../crawler";
import { detectVendorFromDns } from "../dns-vendor-detection";
import {
  KNOWN_Q4_HOSTS,
  KNOWN_NOTIFIED_HOSTS,
  KNOWN_EQUISOLVE_HOSTS,
  KNOWN_INVESTIS_HOSTS,
} from "../../data/known-ir-hosts";

const CORE_PATH = /overview|about|news|press|events|presentations?|financials?/i;
const TOOLS_PATH = /stock|quote|chart|sec|filings?|reports?/i;

/** Core-eligible: index page (0) or same-origin IR page, unless clearly tools-only (stock/quote/sec path). */
function isCorePage(url: string, index: number, baseOrigin: string): boolean {
  if (index === 0) return true;
  try {
    const u = new URL(url);
    const baseOriginNormalized = new URL(baseOrigin.startsWith("http") ? baseOrigin : "https://" + baseOrigin).origin;
    if (u.origin !== baseOriginNormalized) return false;
    if (isToolsPage(url)) return false;
    return isLikelyIRPath(u.pathname) || CORE_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

function isToolsPage(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return TOOLS_PATH.test(path);
  } catch {
    return false;
  }
}

function getPageText(html: string): string {
  const $ = cheerio.load(html);
  const body = $("body").text() || "";
  return body.replace(/\s+/g, " ").trim();
}

/** Footer text from <footer> or footer-equivalent containers (role=contentinfo, #footer, .footer, .site-footer, etc.). */
function getFooterEquivalentText(html: string): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];
  const footerSelectors = [
    "footer",
    "[role='contentinfo']",
    "#footer",
    ".footer",
    ".site-footer",
    "[id*='footer']",
    "[class*='footer']",
  ];
  for (const sel of footerSelectors) {
    $(sel).each((_, el) => {
      const t = $(el).text()?.trim();
      if (t && t.length > 0 && t.length < 5000) parts.push(t);
    });
  }
  if (parts.length > 0) return parts.join(" ").replace(/\s+/g, " ").trim();
  const body = $("body").text() || "";
  return body.length > 2500 ? body.slice(-2500).replace(/\s+/g, " ").trim() : body.replace(/\s+/g, " ").trim();
}

/** True if "Powered by Q4" appears in footer-equivalent text or anywhere in raw HTML (e.g. "Powered By Q4 Inc. 5.174.1.1"). */
function hasPoweredByQ4(html: string): boolean {
  const re = /Powered\s+by\s+Q4\s*(Inc\.?)?(\s|[\d.]|$)/i;
  if (re.test(getFooterEquivalentText(html))) return true;
  return re.test(html);
}

/** Collect hostnames from script/link/img/iframe and from a[href] (e.g. PDF/webcast links). */
function getAssetHostnames(html: string, baseOrigin: string): Set<string> {
  const $ = cheerio.load(html);
  const hosts = new Set<string>();
  const collect = (href: string | undefined) => {
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("data:")) return;
    try {
      const u = new URL(href, baseOrigin);
      if (u.hostname) hosts.add(u.hostname.toLowerCase());
    } catch {
      // ignore
    }
  };
  $("script[src]").each((_, el) => collect($(el).attr("src")));
  $("link[href]").each((_, el) => collect($(el).attr("href")));
  $("img[src]").each((_, el) => collect($(el).attr("src")));
  $("iframe[src]").each((_, el) => collect($(el).attr("src")));
  $("a[href]").each((_, el) => collect($(el).attr("href")));
  return hosts;
}

/** True if any asset or link URL (full URL) contains the given substring (e.g. "q4cdn" for Q4 on AWS). */
function anyAssetUrlContains(html: string, baseOrigin: string, substring: string): boolean {
  const lower = substring.toLowerCase();
  const $ = cheerio.load(html);
  const check = (href: string | undefined) => {
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("data:")) return false;
    try {
      const u = new URL(href, baseOrigin);
      return u.href.toLowerCase().includes(lower);
    } catch {
      return false;
    }
  };
  const sources: string[] = [];
  $("script[src]").each((_, el) => { const s = $(el).attr("src"); if (s) sources.push(s); });
  $("link[href]").each((_, el) => { const s = $(el).attr("href"); if (s) sources.push(s); });
  $("img[src]").each((_, el) => { const s = $(el).attr("src"); if (s) sources.push(s); });
  $("iframe[src]").each((_, el) => { const s = $(el).attr("src"); if (s) sources.push(s); });
  $("a[href]").each((_, el) => { const s = $(el).attr("href"); if (s) sources.push(s); });
  return sources.some((s) => check(s));
}

/** True if raw page HTML contains any of the substrings (e.g. Q4 URLs in inline script or config). */
function pageHtmlContains(html: string, substrings: string[]): boolean {
  const lower = html.toLowerCase();
  return substrings.some((s) => lower.includes(s.toLowerCase()));
}

/** NIR fingerprint (Notified IR): field_nir_ / field_nir_sec_* (+10 auto-host), nir_sec_ (+8). High-confidence for investors.zoom.us etc. */
function findNirOnPage(pageUrl: string, html: string, baseOrigin: string): { fieldNir: boolean; nirSec: boolean; source: string } | null {
  const urlLower = pageUrl.toLowerCase();
  const lower = html.toLowerCase();
  const hasFieldNir = (s: string) => /field_nir_/.test(s);
  const hasNirSec = (s: string) => /nir_sec_/.test(s);
  if (hasFieldNir(urlLower) || hasNirSec(urlLower)) {
    return { fieldNir: hasFieldNir(urlLower), nirSec: hasNirSec(urlLower), source: "url" };
  }
  if (hasFieldNir(lower) || hasNirSec(lower)) {
    return { fieldNir: hasFieldNir(lower), nirSec: hasNirSec(lower), source: "html" };
  }
  const $ = cheerio.load(html);
  try {
    const base = new URL(baseOrigin).origin;
    let found: { fieldNir: boolean; nirSec: boolean; source: string } | null = null;
    $("a[href]").each((_, el) => {
      if (found) return;
      const href = $(el).attr("href");
      if (!href) return;
      try {
        const u = new URL(href, baseOrigin);
        if (u.origin !== base) return;
        const h = u.href.toLowerCase();
        if (hasFieldNir(h) || hasNirSec(h)) {
          found = { fieldNir: hasFieldNir(h), nirSec: hasNirSec(h), source: "link" };
        }
      } catch {
        // skip
      }
    });
    if (found) return found;
    $("script:not([src])").each((_, el) => {
      if (found) return;
      const t = ($(el).html() || "").toLowerCase();
      if (hasFieldNir(t) || hasNirSec(t)) {
        found = { fieldNir: hasFieldNir(t), nirSec: hasNirSec(t), source: "script" };
      }
    });
    return found;
  } catch {
    return null;
  }
}

type VendorId = "Q4" | "Notified" | "Equisolve" | "Investis";

interface PageMatch {
  vendor: VendorId;
  onCore: boolean;
  onTools: boolean;
  poweredByOnCore: boolean;
  confidence: "high" | "medium";
  /** Strong platform signal (e.g. Q4 in page code); 1 core page is enough for host. */
  strongPlatformSignal?: boolean;
  /** Human-readable label for debug (which signal fired). */
  decisiveSignalLabel?: string;
  /** Extra score weight for this match (e.g. NIR: +10 or +8). */
  scoreBonus?: number;
  /** Notified NIR fingerprint present: qualifies even on tools-only pages, prevents tools-only filter. */
  notifiedNirSignal?: boolean;
}

function detectVendorsOnPage(
  page: CrawlPage,
  pageIndex: number,
  baseOrigin: string
): PageMatch[] {
  const text = getPageText(page.html);
  const hosts = getAssetHostnames(page.html, baseOrigin);
  const core = isCorePage(page.url, pageIndex, baseOrigin);
  const tools = isToolsPage(page.url);
  const matches: PageMatch[] = [];

  const hostMatches = (list: string[]): boolean =>
    list.some((h) => Array.from(hosts).some((host) => host.includes(h)));

  // Q4: "Powered by Q4" from full HTML or footer-equivalent; strong signals from assets/HTML/meta/inline
  const q4PoweredBy = hasPoweredByQ4(page.html);
  const Q4_HOSTS = [
    "q4cdn.com",
    "q4web.com",
    "q4inc.com",
    "q4hosting.com",
    "q4app.com",
    "q4systems.com",
    "q4web.net",
    "q4cdn.net",
  ];
  const q4Host = hostMatches(Q4_HOSTS);
  const q4CdnRef = anyAssetUrlContains(page.html, baseOrigin, "q4cdn");
  const q4AppRef = anyAssetUrlContains(page.html, baseOrigin, "q4app");
  const q4StaticApiFeeds =
    anyAssetUrlContains(page.html, baseOrigin, "static.q4inc.com") ||
    anyAssetUrlContains(page.html, baseOrigin, "api.q4inc.com") ||
    anyAssetUrlContains(page.html, baseOrigin, "feeds.q4inc.com") ||
    anyAssetUrlContains(page.html, baseOrigin, "services.q4inc.com");
  const q4MetaGenerator = (() => {
    const $ = cheerio.load(page.html);
    const gen = $("meta[name='generator']").attr("content") || "";
    return /q4/i.test(gen);
  })();
  const q4InPageCode = pageHtmlContains(page.html, [
    "q4cdn",
    "q4app.com",
    "q4web.com",
    "q4inc.com",
    "q4hosting.com",
    "q4systems.com",
    "q4inc.",
    "q4web.",
    "q4app.",
    "static.q4inc.com",
    "api.q4inc.com",
    "feeds.q4inc.com",
    "services.q4inc.com",
    "q4api",
    "q4web.net",
    "q4cdn.net",
  ]);
  const q4Strong = q4Host || q4CdnRef || q4AppRef || q4StaticApiFeeds || q4MetaGenerator || q4InPageCode;
  const q4Signal = q4PoweredBy || q4Host || q4CdnRef || q4AppRef || q4InPageCode;
  if (q4Signal || q4Strong) {
    let decisiveLabel = "q4 in page code";
    if (q4PoweredBy) decisiveLabel = "Powered by Q4";
    else if (q4Host) decisiveLabel = "q4 host in assets";
    else if (q4CdnRef) decisiveLabel = "q4cdn URL";
    else if (q4AppRef) decisiveLabel = "q4app URL";
    else if (q4StaticApiFeeds) decisiveLabel = "q4inc.com api/feeds/services/static";
    else if (q4MetaGenerator) decisiveLabel = "meta generator Q4";
    else if (q4InPageCode) decisiveLabel = "q4api or q4inc in HTML";
    matches.push({
      vendor: "Q4",
      onCore: core && (q4Signal || q4Strong),
      onTools: tools && (q4Signal || q4Strong),
      poweredByOnCore: core && q4PoweredBy,
      confidence: q4PoweredBy || q4CdnRef || q4MetaGenerator ? "high" : "high",
      strongPlatformSignal: q4Strong,
      decisiveSignalLabel: decisiveLabel,
    });
  }

  // Notified: strong infrastructure (hosts + URL/path fingerprints) and weak text (Refinitiv/Kaleidoscope)
  const NOTIFIED_STRONG_HOSTS = [
    "shareholder.com",
    "gcs-web.com",
    "stockpr.com",
    "ir.stockpr.com",
    "notified.com",
    "intrado.com",
    "west.com",
    "notified.eu",
    "bnkm.com", // Notified / Bank of New York Mellon IR
  ];
  const notifiedStrongHost = hostMatches(NOTIFIED_STRONG_HOSTS);
  const notifiedPathFingerprints = pageHtmlContains(page.html, [
    "phoenix.zhtml",
    "secfiling.cfm",
    "news-releases.cfm",
    "eventdetail.cfm",
    "External.File?item=",
    "eventdetail.zhtml",
    "news-releases.zhtml",
    "sec-filings.zhtml",
    "financial-information.zhtml",
    "investorrelations.",
    "ir.notified",
  ]);
  const notifiedWeakText =
    /Data provided by Refinitiv/i.test(text) ||
    /Data provided by Kaleidoscope/i.test(text) ||
    /Powered by Notified/i.test(text) ||
    /Notified\.com/i.test(text);
  const notifiedNir = findNirOnPage(page.url, page.html, baseOrigin);
  const notifiedStrong = notifiedStrongHost || notifiedPathFingerprints || !!notifiedNir;
  const notifiedSignal = notifiedStrong || notifiedWeakText;
  if (notifiedSignal) {
    const coreForNotified = core || (() => {
      try {
        const path = new URL(page.url).pathname.toLowerCase();
        return /news|releases|filings|events|event|sec/.test(path);
      } catch {
        return false;
      }
    })();
    const nirLabel = notifiedNir
      ? (notifiedNir.fieldNir ? "NIR fingerprint (field_nir_)" : "NIR fingerprint (nir_sec_)")
      : null;
    matches.push({
      vendor: "Notified",
      onCore: coreForNotified && notifiedSignal,
      onTools: tools && notifiedSignal,
      poweredByOnCore: false,
      confidence: notifiedStrong ? "high" : "medium",
      strongPlatformSignal: notifiedStrong,
      decisiveSignalLabel: nirLabel ?? (notifiedPathFingerprints
        ? "Notified path fingerprint"
        : notifiedStrongHost
          ? "Notified host"
          : "Refinitiv/Kaleidoscope text"),
      scoreBonus: notifiedNir ? (notifiedNir.fieldNir ? 10 : 8) : undefined,
      notifiedNirSignal: !!notifiedNir,
    });
  }
  if (notifiedNir && !notifiedStrongHost && !notifiedPathFingerprints && !notifiedWeakText) {
    matches.push({
      vendor: "Notified",
      onCore: core,
      onTools: tools,
      poweredByOnCore: false,
      confidence: "high",
      strongPlatformSignal: true,
      decisiveSignalLabel: notifiedNir.fieldNir ? "NIR fingerprint (field_nir_)" : "NIR fingerprint (nir_sec_)",
      scoreBonus: notifiedNir.fieldNir ? 10 : 8,
      notifiedNirSignal: true,
    });
  }

  // Equisolve (QuoteMedia, CDN; common on IR sites e.g. Equifax, Walmart)
  const equisolveText =
    /QuoteMedia|Market data powered by QuoteMedia|Equisolve/i.test(text);
  const equisolveBrand = /Equisolve/i.test(text);
  const equisolveHost = hostMatches([
    "equisolve.com",
    "equisolve.net",
    "equisolveclient.com",
    "d1io3yog0oux5.cloudfront.net",
    "d2c8v52m5u9mz0.cloudfront.net",
  ]);
  const equisolveInHtml = pageHtmlContains(page.html, [
    "equisolve",
    "quotemedia",
    "d1io3yog0oux5",
  ]);
  if (equisolveText || equisolveHost || equisolveBrand || equisolveInHtml) {
    const confidence: "high" | "medium" =
      equisolveHost || equisolveBrand || equisolveInHtml ? "high" : "medium";
    matches.push({
      vendor: "Equisolve",
      onCore: core && (equisolveText || equisolveHost || equisolveBrand || equisolveInHtml),
      onTools: tools && (equisolveText || equisolveHost || equisolveBrand || equisolveInHtml),
      poweredByOnCore: false,
      confidence,
      strongPlatformSignal: equisolveHost || equisolveBrand || equisolveInHtml,
    });
  }

  // Investis (Investis Digital; common on UK/EU IR sites)
  const investisText =
    /Investis Digital|An Investis Digital service|investis\.com/i.test(text);
  const investisHost = hostMatches([
    "investisdigital.com",
    "investis.com",
  ]);
  const investisInHtml = pageHtmlContains(page.html, [
    "investisdigital",
    "investis.com",
    "investis-digital",
  ]);
  if (investisText || investisHost || investisInHtml) {
    matches.push({
      vendor: "Investis",
      onCore: core && (investisText || investisHost || investisInHtml),
      onTools: tools && (investisText || investisHost || investisInHtml),
      poweredByOnCore: false,
      confidence: investisHost || investisInHtml ? "high" : "medium",
      strongPlatformSignal: investisHost || investisInHtml,
    });
  }

  return matches;
}

const VENDOR_TO_HOST: Record<VendorId, IrHostProvider> = {
  Q4: "Q4 Inc.",
  Notified: "Notified",
  Equisolve: "Equisolve",
  Investis: "Investis",
};

const VENDOR_TO_TOOLS: Record<VendorId, ToolsFeedsProvider> = {
  Q4: "Q4 Inc.",
  Notified: "Notified",
  Equisolve: "Equisolve",
  Investis: "Investis",
};

/** Tie-break when multiple vendors match: prefer Equisolve over Q4 when both appear (Equisolve CDN = full IR platform; Q4 may be embedded widget only, e.g. Lyft). */
const HOST_PRIORITY: VendorId[] = ["Equisolve", "Q4", "Notified", "Investis"];

/** Min response body size (bytes) for a probed URL to count as valid for NIR fingerprint (avoids empty/error pages). */
const MIN_PROBE_BODY_BYTES = 500;

/** Notified infra hostnames: presence in fetched HTML counts as corroboration for probe NIR. */
const NOTIFIED_INFRA_HOSTS = [
  "gcs-web.com",
  "stockpr.com",
  "shareholder.com",
  "notified.com",
  "intrado.com",
  "west.com",
];

/** True if any fetched page has NIR (field_nir_/nir_sec_) in HTML or same-origin links, or any Notified infra hostname. */
function hasCorroborationForProbeNir(pages: CrawlPage[], baseOrigin: string): boolean {
  const base = new URL(baseOrigin.startsWith("http") ? baseOrigin : "https://" + baseOrigin).origin;
  for (const page of pages) {
    if (findNirOnPage(page.url, page.html, baseOrigin)) return true;
    const lower = page.html.toLowerCase();
    if (NOTIFIED_INFRA_HOSTS.some((h) => lower.includes(h))) return true;
  }
  return false;
}

export interface HostingProviderOptions {
  /** Final URL of first page after redirects (for DNS fallback). */
  firstPageFinalUrl?: string;
  /** Fetch quality of first page; when poor, DNS/CNAME detection is used. */
  firstPageFetchQuality?: "OK" | "JS-shell" | "blocked";
  /** Forced probe results; final URLs checked for NIR fingerprint even when fetch failed (e.g. 403). */
  probedFinalUrls?: ProbedUrl[];
}

export async function analyzeHostingProvider(
  pages: CrawlPage[],
  origin: string,
  options?: HostingProviderOptions
): Promise<IrHostingResult> {
  const baseOrigin = origin.replace(/\/$/, "") + "/";
  type VendorData = {
    coreCount: number;
    sawOnCore: boolean;
    sawOnTools: boolean;
    sawOnIndexPage: boolean;
    poweredByOnCore: boolean;
    strongPlatformSignalOnCore: boolean;
    /** Strong signal on any non-tools-only page (index or core), so Q4 can qualify with 0-1 core. */
    strongPlatformSignalOnNonToolsOnlyPage: boolean;
    /** Strong signal on any page (including tools-only); used so Notified qualifies when NIR on /sec-filings etc. */
    strongPlatformSignalOnAnyPage: boolean;
    /** Notified NIR fingerprint seen: auto-host weight, prevents tools-only exclusion. */
    notifiedNirSignal: boolean;
    maxConfidence: "high" | "medium";
    /** Weighted score 0–100 for debug (strong signals high, weak low). */
    score: number;
    exampleDecisiveSignal?: string;
    exampleSourcePage?: string;
  };
  const byVendor = new Map<VendorId, VendorData>();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageMatches = detectVendorsOnPage(page, i, baseOrigin);
    const nonToolsOnlyPage = i === 0 || isCorePage(page.url, i, baseOrigin);
    for (const m of pageMatches) {
      const cur = byVendor.get(m.vendor);
      const coreCount = (cur?.coreCount ?? 0) + (m.onCore ? 1 : 0);
      const sawOnCore = (cur?.sawOnCore ?? false) || m.onCore;
      const sawOnTools = (cur?.sawOnTools ?? false) || m.onTools;
      const sawOnIndexPage = (cur?.sawOnIndexPage ?? false) || (i === 0);
      const poweredByOnCore = (cur?.poweredByOnCore ?? false) || m.poweredByOnCore;
      const strongPlatformSignalOnCore = (cur?.strongPlatformSignalOnCore ?? false) || (m.onCore && !!m.strongPlatformSignal);
      const strongPlatformSignalOnNonToolsOnlyPage = (cur?.strongPlatformSignalOnNonToolsOnlyPage ?? false) || (!!m.strongPlatformSignal && nonToolsOnlyPage);
      const strongPlatformSignalOnAnyPage = (cur?.strongPlatformSignalOnAnyPage ?? false) || !!m.strongPlatformSignal;
      const notifiedNirSignal = (cur?.notifiedNirSignal ?? false) || !!m.notifiedNirSignal;
      const maxConfidence = cur?.maxConfidence === "high" || m.confidence === "high" ? "high" : "medium";
      const scoreDelta = m.onCore || m.onTools ? (m.strongPlatformSignal ? 35 : 10) : 0;
      const score = Math.min(100, (cur?.score ?? 0) + scoreDelta + (m.scoreBonus ?? 0));
      const contributesToQualify = m.poweredByOnCore || (m.onCore && !!m.strongPlatformSignal) || m.onCore || (!!m.strongPlatformSignal && nonToolsOnlyPage) || !!m.notifiedNirSignal;
      const label = m.decisiveSignalLabel ?? (m.onCore || m.poweredByOnCore ? VENDOR_TO_HOST[m.vendor] : undefined);
      const exampleDecisiveSignal = cur?.exampleDecisiveSignal ?? (contributesToQualify && label ? label : undefined);
      const exampleSourcePage = cur?.exampleSourcePage ?? (contributesToQualify ? (i === 0 ? "index" : page.url) : undefined);
      byVendor.set(m.vendor, {
        coreCount,
        sawOnCore,
        sawOnTools,
        sawOnIndexPage,
        poweredByOnCore,
        strongPlatformSignalOnCore,
        strongPlatformSignalOnNonToolsOnlyPage,
        strongPlatformSignalOnAnyPage,
        notifiedNirSignal,
        maxConfidence,
        score,
        exampleDecisiveSignal: exampleDecisiveSignal || cur?.exampleDecisiveSignal,
        exampleSourcePage: exampleSourcePage || cur?.exampleSourcePage,
      });
    }
  }

  // Forced probe: NIR in probed URL counts only when (1) under IR base path, (2) 2xx + non-trivial body, (3) corroboration in fetched HTML/links or Notified infra, (4) not overriding strong Q4.
  let debugProbeGates: IrHostingResult["debugProbeGates"] | undefined;
  const irBasePath = (() => {
    const first = pages[0]?.url;
    if (!first) return "/";
    try {
      const p = new URL(first).pathname.replace(/\/+$/, "") || "/";
      return p || "/";
    } catch {
      return "/";
    }
  })();
  const contentCorroborated = hasCorroborationForProbeNir(pages, baseOrigin);
  const q4StrongOnInScope =
    (byVendor.get("Q4")?.strongPlatformSignalOnCore ?? false) ||
    (byVendor.get("Q4")?.strongPlatformSignalOnNonToolsOnlyPage ?? false);

  if (options?.probedFinalUrls?.length) {
    for (const p of options.probedFinalUrls) {
      const u = (p.finalUrl || p.requested).toLowerCase();
      if (!/field_nir_|nir_sec_/.test(u)) continue;

      const requestedPath = (() => {
        try {
          return new URL(p.requested).pathname.replace(/\/+$/, "") || "/";
        } catch {
          return "/";
        }
      })();
      const basePathMatch =
        irBasePath === "/" ||
        requestedPath === irBasePath ||
        requestedPath.startsWith(irBasePath + "/");
      const statusOk =
        p.status >= 200 &&
        p.status < 300 &&
        (p.bodySize ?? 0) >= MIN_PROBE_BODY_BYTES;
      const overrideBlocked = q4StrongOnInScope;

      const decisiveSignal =
        /field_nir_/.test(u)
          ? "NIR fingerprint (field_nir_) in probed URL"
          : "NIR fingerprint (nir_sec_) in probed URL";
      const sourcePage = p.finalUrl || p.requested;
      debugProbeGates = {
        decisiveSignal,
        sourcePage,
        basePathMatch,
        statusOk,
        contentCorroborated,
        overrideBlocked,
      };

      const allowed =
        basePathMatch && statusOk && contentCorroborated && !overrideBlocked;
      if (!allowed) continue;

      const cur = byVendor.get("Notified");
      const scoreBonus = /field_nir_/.test(u) ? 10 : 8;
      byVendor.set("Notified", {
        coreCount: cur?.coreCount ?? 0,
        sawOnCore: cur?.sawOnCore ?? false,
        sawOnTools: cur?.sawOnTools ?? true,
        sawOnIndexPage: cur?.sawOnIndexPage ?? false,
        poweredByOnCore: cur?.poweredByOnCore ?? false,
        strongPlatformSignalOnCore: cur?.strongPlatformSignalOnCore ?? false,
        strongPlatformSignalOnNonToolsOnlyPage: cur?.strongPlatformSignalOnNonToolsOnlyPage ?? false,
        strongPlatformSignalOnAnyPage: true,
        notifiedNirSignal: true,
        maxConfidence: "high",
        score: Math.min(100, (cur?.score ?? 0) + scoreBonus),
        exampleDecisiveSignal: cur?.exampleDecisiveSignal ?? decisiveSignal,
        exampleSourcePage: cur?.exampleSourcePage ?? sourcePage,
      });
    }
  }

  /** Q4/Notified are not tools-only if seen on index or when Notified has NIR fingerprint. */
  const toolsOnly = (v: VendorId): boolean => {
    const data = byVendor.get(v);
    if (!data || !data.sawOnTools || data.sawOnCore) return false;
    if (v === "Q4" && data.sawOnIndexPage) return false;
    if (v === "Notified" && (data.sawOnIndexPage || data.notifiedNirSignal)) return false;
    return true;
  };

  // Host: 2+ core OR powered-by on core OR 1+ core with strong signal; Q4 also qualifies if strong signal on any non-tools-only page (0-1 core)
  let hostProvider: string = "Internal/Other";
  let confidence: "high" | "medium" = "medium";
  let debugDecisiveSignal: string | undefined;
  let debugSourcePage: string | undefined;
  let debugHostReason: string | undefined;
  const hostCandidates: { vendor: VendorId; conf: "high" | "medium"; data: VendorData }[] = [];

  for (const v of HOST_PRIORITY) {
    const data = byVendor.get(v);
    if (!data) continue;
    if (toolsOnly(v)) continue;
    const qualifies =
      data.coreCount >= 2 ||
      data.poweredByOnCore ||
      (data.coreCount >= 1 && data.strongPlatformSignalOnCore) ||
      (v === "Q4" && data.strongPlatformSignalOnNonToolsOnlyPage) ||
      (v === "Notified" && (data.strongPlatformSignalOnCore || data.strongPlatformSignalOnAnyPage || data.notifiedNirSignal));
    if (qualifies) {
      hostCandidates.push({ vendor: v, conf: data.maxConfidence, data });
    }
  }

  const debugVendorScores: Record<string, number> = {};
  for (const v of HOST_PRIORITY) {
    const d = byVendor.get(v);
    if (d && d.score > 0) debugVendorScores[VENDOR_TO_HOST[v]] = Math.min(100, d.score);
  }
  if (hostCandidates.length === 0 && Object.keys(debugVendorScores).length > 0) {
    debugHostReason = "no qualifying vendor (scores present but did not meet core/strong threshold)";
  } else if (hostCandidates.length === 0) {
    debugHostReason = "no vendor signals found";
  }

  if (hostCandidates.length > 0) {
    hostCandidates.sort((a, b) => {
      if (a.conf !== b.conf) return a.conf === "high" ? -1 : 1;
      return HOST_PRIORITY.indexOf(a.vendor) - HOST_PRIORITY.indexOf(b.vendor);
    });
    const names = [...new Set(hostCandidates.map((c) => VENDOR_TO_HOST[c.vendor]))];
    hostProvider = names.join(" / ");
    confidence = hostCandidates.some((c) => c.conf === "high") ? "high" : "medium";
    const first = hostCandidates[0];
    debugDecisiveSignal = first.data.exampleDecisiveSignal;
    debugSourcePage = first.data.exampleSourcePage;
    debugHostReason =
      first.data.poweredByOnCore
        ? "powered-by on core"
        : first.data.strongPlatformSignalOnNonToolsOnlyPage
          ? "strong signal on non-tools-only page"
          : first.data.coreCount >= 2
            ? "2+ core pages"
            : "1 core + strong signal";
  }

  // Fallback: DNS/CNAME on IR hostname for any Internal/Other (catches vendor subdomains even when HTML has no fingerprint)
  if (hostProvider === "Internal/Other") {
    let hostname: string;
    try {
      const urlToUse =
        options?.firstPageFinalUrl && options.firstPageFinalUrl.startsWith("http")
          ? options.firstPageFinalUrl
          : origin.startsWith("http")
            ? origin
            : `https://${origin}`;
      hostname = new URL(urlToUse).hostname;
    } catch {
      try {
        hostname = new URL(origin.startsWith("http") ? origin : `https://${origin}`).hostname;
      } catch {
        hostname = "";
      }
    }
    if (hostname) {
      try {
        const dnsVendor = await detectVendorFromDns(hostname);
        if (dnsVendor) {
          hostProvider = dnsVendor.vendor === "Q4" ? "Q4 Inc." : "Notified";
          confidence = "medium";
          debugDecisiveSignal = `DNS/CNAME: ${dnsVendor.matched}`;
          debugSourcePage = "origin";
          debugHostReason = "DNS/CNAME fallback";
        }
      } catch {
        // ignore DNS errors
      }
    }
  }

  // Fallback: known vendor hostnames from curated list (client-rendered or missed by fingerprints)
  if (hostProvider === "Internal/Other") {
    let hostname: string;
    try {
      hostname = new URL(origin).hostname.toLowerCase();
    } catch {
      hostname = "";
    }
    const matchesKnown = (list: string[]) =>
      hostname && list.some((h) => hostname === h || hostname.endsWith("." + h));
    if (matchesKnown(KNOWN_Q4_HOSTS)) {
      hostProvider = "Q4 Inc.";
      confidence = "medium";
      debugDecisiveSignal = "known Q4 domain";
      debugSourcePage = "origin";
    } else if (matchesKnown(KNOWN_NOTIFIED_HOSTS)) {
      hostProvider = "Notified";
      confidence = "medium";
      debugDecisiveSignal = "known Notified domain";
      debugSourcePage = "origin";
    } else if (matchesKnown(KNOWN_EQUISOLVE_HOSTS)) {
      hostProvider = "Equisolve";
      confidence = "medium";
      debugDecisiveSignal = "known Equisolve domain";
      debugSourcePage = "origin";
    } else if (matchesKnown(KNOWN_INVESTIS_HOSTS)) {
      hostProvider = "Investis";
      confidence = "medium";
      debugDecisiveSignal = "known Investis domain";
      debugSourcePage = "origin";
    }
  }

  // Tools/feeds: only when host is Internal/Other and we have tools-only vendor(s)
  let toolsFeedsProvider: ToolsFeedsProvider | undefined;
  const toolsOnlyVendors: VendorId[] = HOST_PRIORITY.filter((v) => toolsOnly(v));
  if (hostProvider === "Internal/Other" && toolsOnlyVendors.length > 0) {
    if (toolsOnlyVendors.length >= 2) {
      toolsFeedsProvider = "Multiple";
    } else {
      toolsFeedsProvider = VENDOR_TO_TOOLS[toolsOnlyVendors[0]];
    }
  }

  return {
    irHostProvider: hostProvider,
    confidence,
    ...(toolsFeedsProvider && { toolsFeedsProvider }),
    debugHost: hostProvider,
    debugConfidence: confidence,
    ...(debugDecisiveSignal != null && { debugDecisiveSignal }),
    ...(debugSourcePage != null && { debugSourcePage }),
    ...(debugHostReason != null && { debugHostReason }),
    ...(Object.keys(debugVendorScores).length > 0 && { debugVendorScores }),
    ...(debugProbeGates && { debugProbeGates }),
  };
}

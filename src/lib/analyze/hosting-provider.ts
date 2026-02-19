/**
 * Deterministic detection of IR site hosting provider and tools/feeds provider.
 * Classifies pages as core (index + same-origin IR pages) vs tools (stock, SEC, filings).
 * Uses full HTML, footer and footer-equivalent text, and asset/script/link URL hostnames.
 */

import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { IrHostingResult, IrHostProvider, ToolsFeedsProvider } from "../types";
import { isLikelyIRPath } from "../url-utils";

const CORE_PATH = /overview|about|news|press|events|presentations?|financials?/i;
const TOOLS_PATH = /stock|quote|chart|sec|filings?|reports?/i;

/** Core-eligible: index page (0) or same-origin URL with IR-like path. */
function isCorePage(url: string, index: number, baseOrigin: string): boolean {
  if (index === 0) return true;
  try {
    const u = new URL(url);
    const baseOriginNormalized = new URL(baseOrigin.startsWith("http") ? baseOrigin : "https://" + baseOrigin).origin;
    if (u.origin !== baseOriginNormalized) return false;
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

/** Footer text from <footer> or footer-equivalent containers (id/class/role). */
function getFooterEquivalentText(html: string): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];
  $("footer").each((_, el) => {
    const t = $(el).text()?.trim();
    if (t) parts.push(t);
  });
  $("[id*='footer'], [class*='footer'], [role='contentinfo']").each((_, el) => {
    const t = $(el).text()?.trim();
    if (t && t.length > 0 && t.length < 5000) parts.push(t);
  });
  if (parts.length > 0) return parts.join(" ").replace(/\s+/g, " ").trim();
  const body = $("body").text() || "";
  return body.length > 2500 ? body.slice(-2500).replace(/\s+/g, " ").trim() : body.replace(/\s+/g, " ").trim();
}

/** True if "Powered by Q4" appears in footer-equivalent text or anywhere in raw HTML. */
function hasPoweredByQ4(html: string): boolean {
  const re = /Powered by Q4\s*(Inc\.?)?/i;
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
  const q4Host = hostMatches(["q4cdn.com", "q4web.com", "q4inc.com", "q4hosting.com", "q4app.com"]);
  const q4CdnRef = anyAssetUrlContains(page.html, baseOrigin, "q4cdn");
  const q4AppRef = anyAssetUrlContains(page.html, baseOrigin, "q4app");
  const q4StaticApiFeeds = anyAssetUrlContains(page.html, baseOrigin, "static.q4inc.com")
    || anyAssetUrlContains(page.html, baseOrigin, "api.q4inc.com")
    || anyAssetUrlContains(page.html, baseOrigin, "feeds.q4inc.com")
    || anyAssetUrlContains(page.html, baseOrigin, "services.q4inc.com");
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
    "q4inc.",
    "q4web.",
    "q4app.",
    "static.q4inc.com",
    "api.q4inc.com",
    "feeds.q4inc.com",
    "services.q4inc.com",
    "q4api",
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

  // Notified (IR platform and tools only; do not use events/webcasts—often different vendors)
  const notifiedText = /Data provided by Refinitiv/i.test(text) || /Data provided by Kaleidoscope/i.test(text);
  const notifiedHost = hostMatches([
    "shareholder.com",
    "notified.com",
    "intrado.com",
    "west.com",
    "gcs-web.com", // Notified IR platform (e.g. Hershey's: hershey.gcs-web.com)
  ]);
  if (notifiedText || notifiedHost) {
    matches.push({
      vendor: "Notified",
      onCore: core && (notifiedText || notifiedHost),
      onTools: tools && (notifiedText || notifiedHost),
      poweredByOnCore: false,
      confidence: notifiedText || notifiedHost ? "high" : "medium",
    });
  }

  // Equisolve (QuoteMedia alone = medium unless paired with Equisolve; CDN used for IR assets e.g. Equifax)
  const equisolveText = /QuoteMedia|Market data powered by QuoteMedia/i.test(text);
  const equisolveBrand = /Equisolve/i.test(text);
  const equisolveHost = hostMatches([
    "equisolve.com",
    "equisolve.net",
    "d1io3yog0oux5.cloudfront.net", // Equisolve IR CDN (e.g. Equifax)
  ]);
  if (equisolveText || equisolveHost || equisolveBrand) {
    const confidence: "high" | "medium" = equisolveHost || equisolveBrand ? "high" : "medium";
    matches.push({
      vendor: "Equisolve",
      onCore: core && (equisolveText || equisolveHost || equisolveBrand),
      onTools: tools && (equisolveText || equisolveHost || equisolveBrand),
      poweredByOnCore: false,
      confidence,
    });
  }

  // Investis
  const investisText = /Investis Digital|An Investis Digital service/i.test(text);
  const investisHost = hostMatches(["investisdigital.com", "investis.com"]);
  if (investisText || investisHost) {
    matches.push({
      vendor: "Investis",
      onCore: core && (investisText || investisHost),
      onTools: tools && (investisText || investisHost),
      poweredByOnCore: false,
      confidence: "high",
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

export function analyzeHostingProvider(
  pages: CrawlPage[],
  origin: string
): IrHostingResult {
  const baseOrigin = origin.replace(/\/$/, "") + "/";
  type VendorData = {
    coreCount: number;
    sawOnCore: boolean;
    sawOnTools: boolean;
    sawOnIndexPage: boolean;
    poweredByOnCore: boolean;
    strongPlatformSignalOnCore: boolean;
    maxConfidence: "high" | "medium";
    exampleDecisiveSignal?: string;
    exampleSourcePage?: string;
  };
  const byVendor = new Map<VendorId, VendorData>();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageMatches = detectVendorsOnPage(page, i, baseOrigin);
    for (const m of pageMatches) {
      const cur = byVendor.get(m.vendor);
      const coreCount = (cur?.coreCount ?? 0) + (m.onCore ? 1 : 0);
      const sawOnCore = (cur?.sawOnCore ?? false) || m.onCore;
      const sawOnTools = (cur?.sawOnTools ?? false) || m.onTools;
      const sawOnIndexPage = (cur?.sawOnIndexPage ?? false) || (i === 0);
      const poweredByOnCore = (cur?.poweredByOnCore ?? false) || m.poweredByOnCore;
      const strongPlatformSignalOnCore = (cur?.strongPlatformSignalOnCore ?? false) || (m.onCore && !!m.strongPlatformSignal);
      const maxConfidence = cur?.maxConfidence === "high" || m.confidence === "high" ? "high" : "medium";
      const contributesToQualify = m.poweredByOnCore || (m.onCore && !!m.strongPlatformSignal) || m.onCore;
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
        maxConfidence,
        exampleDecisiveSignal: exampleDecisiveSignal || cur?.exampleDecisiveSignal,
        exampleSourcePage: exampleSourcePage || cur?.exampleSourcePage,
      });
    }
  }

  /** Q4 is not tools-only if it was seen on the index page. */
  const toolsOnly = (v: VendorId): boolean => {
    const data = byVendor.get(v);
    if (!data || !data.sawOnTools || data.sawOnCore) return false;
    if (v === "Q4" && data.sawOnIndexPage) return false;
    return true;
  };

  // Host: vendor on 2+ core pages OR "Powered by" on core OR 1+ core page with strong platform signal (Q4 qualifies with single core + strong)
  let hostProvider: string = "Internal/Other";
  let confidence: "high" | "medium" = "medium";
  let debugDecisiveSignal: string | undefined;
  let debugSourcePage: string | undefined;
  const hostCandidates: { vendor: VendorId; conf: "high" | "medium"; data: VendorData }[] = [];

  for (const v of HOST_PRIORITY) {
    const data = byVendor.get(v);
    if (!data) continue;
    if (toolsOnly(v)) continue;
    const qualifies = data.coreCount >= 2 || data.poweredByOnCore || (data.coreCount >= 1 && data.strongPlatformSignalOnCore);
    if (qualifies) {
      hostCandidates.push({ vendor: v, conf: data.maxConfidence, data });
    }
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
  }

  // Fallback: known Q4-hosted IR domains that don't expose Q4 in server-rendered HTML (e.g. client-rendered)
  if (hostProvider === "Internal/Other") {
    let hostname: string;
    try {
      hostname = new URL(origin).hostname.toLowerCase();
    } catch {
      hostname = "";
    }
    const knownQ4Hosts = [
      "investor.nvidia.com",
      "www.oracle.com",
    ];
    if (hostname && knownQ4Hosts.some((h) => hostname === h || hostname.endsWith("." + h))) {
      hostProvider = "Q4 Inc.";
      confidence = "medium";
      debugDecisiveSignal = "known Q4 domain fallback";
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
  };
}

/**
 * URL normalization and same-domain enforcement for the crawler.
 */

export function normalizeUrl(input: string, baseOrigin?: string): string | null {
  try {
    let url = input.trim();
    if (!/^https?:\/\//i.test(url)) {
      if (!baseOrigin) return null;
      url = new URL(url, baseOrigin).href;
    }
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.sort();
    // Normalize path: strip trailing slash (except for root)
    let path = parsed.pathname.replace(/\/+/g, "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    parsed.pathname = path || "/";
    return parsed.href;
  } catch {
    return null;
  }
}

export function getOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function isSameDomain(url: string, allowedOrigin: string): boolean {
  const origin = getOrigin(url);
  return origin !== null && origin === allowedOrigin;
}

export function isLikelyIRPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  const segments = lower.split("/").filter(Boolean);
  const irKeywords = [
    "investor",
    "investors",
    "investor-relations",
    "ir",
    "shareholder",
    "shareholders",
    "financial",
    "financial-information",
    "sec",
    "sec-filings",
    "news",
    "press",
    "event",
    "events",
    "presentations",
    "governance",
    "esg",
    "earnings",
    "reports",
    "filings",
  ];
  return segments.some((s) => irKeywords.some((k) => s.includes(k) || k.includes(s)));
}

export function extractDomainDisplay(origin: string): string {
  try {
    const u = new URL(origin);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return origin;
  }
}

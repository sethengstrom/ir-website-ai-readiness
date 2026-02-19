/**
 * DNS/CNAME-based vendor detection for IR hosting when fetch quality is poor
 * (JS-shell or blocked). Resolves CNAMEs for the given hostname and checks
 * for known vendor domains.
 */

import * as dns from "node:dns/promises";

export type DnsVendorId = "Q4" | "Notified";

const CNAME_PATTERNS: { vendor: DnsVendorId; patterns: RegExp[] }[] = [
  {
    vendor: "Q4",
    patterns: [/q4inc\.com$/i, /q4web\.com$/i, /q4hosting\.com$/i, /q4cdn\.com$/i],
  },
  {
    vendor: "Notified",
    patterns: [
      /notified\.com$/i,
      /shareholder\.com$/i,
      /gcs-web\.com$/i,
      /stockpr\.com$/i,
      /intrado\.com$/i,
      /west\.com$/i,
    ],
  },
];

export interface DnsVendorResult {
  vendor: DnsVendorId;
  /** Resolved CNAME or hostname that matched. */
  matched: string;
}

/**
 * Resolve CNAME chain for hostname (follows one level; some setups use CNAME to vendor).
 * Returns vendor if any CNAME or the hostname itself matches a known vendor pattern.
 */
export async function detectVendorFromDns(hostname: string): Promise<DnsVendorResult | null> {
  const normalized = hostname.replace(/^www\./, "").toLowerCase();
  const toCheck: string[] = [normalized];

  try {
    const cnameResult = await dns.resolveCname(normalized).catch(() => null);
    if (cnameResult && Array.isArray(cnameResult) && cnameResult.length > 0) {
      const first = String(cnameResult[0]).toLowerCase();
      toCheck.push(first);
    }
  } catch {
    // CNAME may not exist; continue with hostname only
  }

  for (const name of toCheck) {
    for (const { vendor, patterns } of CNAME_PATTERNS) {
      if (patterns.some((p) => p.test(name))) {
        return { vendor, matched: name };
      }
    }
  }
  return null;
}

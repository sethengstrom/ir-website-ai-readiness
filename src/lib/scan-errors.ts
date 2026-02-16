/**
 * Structured error codes for the scan API so clients can show clear messages and monitor failure modes.
 */

export const SCAN_ERROR_CODES = {
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INVALID_DOMAIN: "INVALID_DOMAIN",
  CRAWL_TIMEOUT: "CRAWL_TIMEOUT",
  ANALYZER_ERROR: "ANALYZER_ERROR",
  SCAN_FAILED: "SCAN_FAILED",
} as const;

export type ScanErrorCode = (typeof SCAN_ERROR_CODES)[keyof typeof SCAN_ERROR_CODES];

const ERROR_MESSAGES: Record<ScanErrorCode, string> = {
  [SCAN_ERROR_CODES.RATE_LIMIT_EXCEEDED]: "Too many scan requests. Please try again in a minute.",
  [SCAN_ERROR_CODES.INVALID_DOMAIN]: "Invalid domain. Enter a valid hostname or URL for both domains.",
  [SCAN_ERROR_CODES.CRAWL_TIMEOUT]: "Scan timed out. The sites may be slow; try again.",
  [SCAN_ERROR_CODES.ANALYZER_ERROR]: "Analysis failed for one or both domains. Try again.",
  [SCAN_ERROR_CODES.SCAN_FAILED]: "Scan failed. Please try again.",
};

export function messageForCode(code: ScanErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES[SCAN_ERROR_CODES.SCAN_FAILED];
}

export function isScanErrorCode(code: string): code is ScanErrorCode {
  return Object.values(SCAN_ERROR_CODES).includes(code as ScanErrorCode);
}

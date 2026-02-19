/**
 * Types for S&P 100 results data (scanner output for top 100 companies).
 */

export interface CategoryScoresRow {
  crawlability: number;
  structuredData: number;
  parseability: number;
  freshness: number;
  irChecklist: number;
}

export interface SP100Row {
  companyName: string;
  ticker: string;
  /** IR domain scanned (e.g. investor.example.com). Empty when not yet scanned or unknown. */
  domain?: string | null;
  /** Overall readiness score 0–100. */
  overallScore?: number | null;
  categoryScores?: CategoryScoresRow | null;
  /** ISO date when this row was last scanned. */
  lastScanned?: string | null;
}

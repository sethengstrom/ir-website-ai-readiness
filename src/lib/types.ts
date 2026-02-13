/**
 * Shared types for findings and scoring.
 */

export type DetectionMethod =
  | "robots_txt"
  | "sitemap_xml"
  | "crawl"
  | "json_ld"
  | "rss_atom"
  | "html_parse"
  | "heuristic"
  | "link_tag"
  | "canonical"
  | "http_header";

export interface Finding {
  category: string;
  subcategory?: string;
  signal: string;
  score: number; // 0-100 for this finding
  evidence: {
    url?: string;
    snippet?: string;
    method: DetectionMethod;
  };
  passed: boolean;
}

export interface CategoryScores {
  crawlability: number;
  structuredData: number;
  parseability: number;
  freshness: number;
  irChecklist: number;
}

export interface DomainResult {
  domain: string;
  origin: string;
  overallScore: number;
  categoryScores: CategoryScores;
  findings: Finding[];
  crawledPageCount: number;
  irUrlCount: number;
  /** Logo or icon URL from the site (favicon, apple-touch-icon, or Organization logo). */
  faviconUrl?: string;
}

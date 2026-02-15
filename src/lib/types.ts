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

/** JSON-LD-only structured data readiness (0–100). Separate from overall category score which may include feeds. */
export interface StructuredDataBreakdown {
  /** Score from JSON-LD analysis only: presence, valid parse, @context, @type, recommended types, field completeness. */
  structuredDataScore: number;
  /** Number of JSON-LD blocks (script tags with valid parse and @type). */
  jsonLdBlockCount: number;
  /** All detected @type values across blocks. */
  detectedTypes: string[];
  /** Recommended IR schema types not found (Organization/Corporation, WebSite, WebPage, FAQPage, NewsArticle, Event, BreadcrumbList). */
  missingRecommendedTypes: string[];
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
  /** Structured data (JSON-LD) breakdown; used to show schema-only score and missing types. */
  structuredDataBreakdown?: StructuredDataBreakdown;
  /** AI Citation Readiness (0–100): weighted by question coverage, crawlability/parseability, structured data. */
  aiCitationReadiness?: number;
  /** Per-question answerability for investor Q&A. */
  investorQuestionCoverage?: InvestorQuestionCoverage;
}

/** Per-question result for Investor Question Coverage (AI answerability). */
export type InvestorQuestionStatus = "answerable" | "partial" | "not_answerable";

export interface InvestorQuestionResult {
  id: string;
  question: string;
  status: InvestorQuestionStatus;
  explanation: string;
  sourceUrl?: string;
  evidenceSnippet?: string;
  /** Page type used for evidence: e.g. homepage, earnings page, filings page, investor page. */
  pageType?: string;
}

/** Result of testing 12 high-impact investor questions (earnings + IR navigation). */
export interface InvestorQuestionCoverage {
  questionResults: InvestorQuestionResult[];
  /** 0–100: share of questions answerable (full + 0.5 for partial). */
  coverageScore: number;
}

/** Top-level score (0–100) for AI citation likelihood: 70% question coverage, 20% crawl/parse, 10% structured data. */
export type AICitationReadinessScore = number;

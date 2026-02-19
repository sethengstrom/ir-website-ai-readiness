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

/** IR-relevant values extracted from JSON-LD for use in investor questions and findings. */
export interface JsonLdFacts {
  ticker?: string;
  orgName?: string;
  /** Event start (and optionally end) dates plus name; for "next earnings call" etc. */
  eventDates?: { startDate: string; endDate?: string; name?: string }[];
  contactPoint?: { email?: string; url?: string; contactType?: string };
  datePublished?: string;
  dateModified?: string;
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

/** Detected IR site hosting provider (deterministic fingerprints). */
export type IrHostProvider =
  | "Q4 Inc."
  | "Notified"
  | "Equisolve"
  | "Investis"
  | "Internal/Other";

/** Detected provider for tools/feeds (stock quote, SEC filings) when IR site is company-hosted. */
export type ToolsFeedsProvider = "Q4 Inc." | "Notified" | "Equisolve" | "Investis" | "Multiple";

export interface IrHostingResult {
  /** IR site host(s). Single vendor or multiple when several qualify, e.g. "Notified / Q4 Inc.". */
  irHostProvider: string;
  /** Confidence of host detection. */
  confidence: "high" | "medium";
  /** Tools/feeds provider when host is Internal/Other and vendor fingerprints appear only on tools pages. */
  toolsFeedsProvider?: ToolsFeedsProvider;
  /** Debug: same as irHostProvider (for display). */
  debugHost?: string;
  /** Debug: same as confidence. */
  debugConfidence?: "high" | "medium";
  /** Debug: which signal decided the host (e.g. "Powered by Q4", "q4cdn in HTML"). */
  debugDecisiveSignal?: string;
  /** Debug: URL or "index" for the page where the decisive signal was found. */
  debugSourcePage?: string;
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
  /** Detected IR hosting provider and optional tools/feeds provider. */
  irHosting?: IrHostingResult;
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

/**
 * Educational content for AEO (Answer Engine Optimization):
 * what we measure, why it matters, and what scores mean.
 */

export const AEO_INTRO = {
  title: "Why AEO matters for investor relations",
  body: "Answer Engine Optimization (AEO) is the practice of making your content discoverable and usable by AI assistants, search engines, and financial data platforms. When analysts, investors, or AI agents look for your earnings, filings, or events, your IR site should be crawlable, well-structured, and complete—so your story is included in answers, not missed.",
  scoreMeaning: "Scores are 0–100 per category. Higher means your site is better positioned for AI and agent retrieval. Use the breakdown below to see what’s measured and how to improve.",
} as const;

export type CategoryKey = keyof typeof CATEGORY_CONTEXT;

export const CATEGORY_CONTEXT: Record<
  string,
  { what: string; why: string; scoreMeaning: string }
> = {
  crawlability: {
    what: "Whether robots.txt and sitemaps allow discovery of your IR section, and how many IR-related URLs we find.",
    why: "AI crawlers and answer engines need to discover your IR pages. Blocking /investors or /investor-relations in robots.txt, or having no sitemap, makes it harder for systems to index and cite your content.",
    scoreMeaning: "100 = robots.txt reachable, IR paths not disallowed, sitemap reachable, and multiple IR URLs discovered. Lower scores indicate blocks or poor discoverability.",
  },
  structuredData: {
    what: "JSON-LD schema (e.g. Organization, NewsArticle, Event, FAQPage) and RSS/Atom feeds.",
    why: "Structured data tells AI exactly what a page is about and how to use it. Feeds give agents a reliable, machine-friendly list of news and events. Both improve how often and how accurately your content is cited.",
    scoreMeaning: "100 = rich schema types (e.g. NewsArticle, Event, Organization) and at least one feed. Lower scores mean less structure for agents to parse.",
  },
  parseability: {
    what: "Server-rendered text length, ratio of main content to boilerplate, headings (H1/H2), and canonical URLs.",
    why: "AI systems need clear, substantial text to extract facts and quotes. Heavy boilerplate, thin content, or missing headings make it harder to understand and cite your pages. Canonicals reduce duplicate-content confusion.",
    scoreMeaning: "100 = substantial main content, good content ratio, clear headings, and canonical tags on key pages. Lower scores suggest thin or noisy pages.",
  },
  freshness: {
    what: "Signals that content is current: earnings/results hubs, dates on press/events pages, and archive sections.",
    why: "Answer engines prioritize recent, dated content. A clear “latest earnings” area and visible dates help AI surface your most relevant, up-to-date information instead of outdated snippets.",
    scoreMeaning: "100 = earnings hub detected, dates on releases/events, and archive-style pages. Lower scores suggest weaker freshness signals.",
  },
  irChecklist: {
    what: "Presence of filings (SEC/EDGAR or SEDAR+), investor presentation, press releases, events/webcasts, IR contact, and governance/ESG links.",
    why: "Complete IR coverage gives AI and agents the full picture—filings, presentations, news, events, and governance—so they can answer questions accurately and link to authoritative sources.",
    scoreMeaning: "100 = all six elements present (filings, presentation, press, events, contact, governance). Score is the share of these we detected.",
  },
};

/**
 * Per-finding "why it matters" so each row explains something specific, not the same category blurb.
 * Key: "category|subcategory" (lowercase, normalized). Subcategory can be partial match.
 */
const FINDING_WHY: Record<string, string> = {
  "crawlability|robots.txt":
    "Crawlers read robots.txt first. If it disallows /investors or /investor-relations, those pages may never be indexed, so AI won’t see your IR content.",
  "crawlability|sitemap":
    "Sitemaps give crawlers a direct list of URLs. Without one, discovery depends on following links from the homepage, so IR pages can be missed or found slowly.",
  "crawlability|crawl":
    "The more IR-related URLs we find, the more pages agents can index and cite. Low counts suggest your IR section is hard to discover.",
  "structureddata|json-ld":
    "JSON-LD schema tells AI what each page is (e.g. NewsArticle, Event, Organization), so it can cite it correctly and use the right fields (dates, author, etc.).",
  "structureddata|feeds":
    "RSS/Atom feeds give agents a machine-friendly list of news and events, so they can surface your latest updates without scraping every page.",
  "parseability|content":
    "AI needs substantial, server-rendered text to extract facts and quotes. Thin or boilerplate-heavy pages are hard to use and get cited less.",
  "parseability|headings":
    "H1/H2 structure helps agents understand the topic and sections, so they can pull the right snippet or summarize accurately.",
  "parseability|canonical":
    "Canonical tags tell agents which URL is the main one, reducing duplicate-content confusion and helping the right page get cited.",
  "freshness|earnings hub":
    "A clear earnings/results hub helps AI surface your latest quarter when users ask about your performance, instead of an old or random page.",
  "freshness|dates":
    "Visible dates on press releases and events let agents know how current each item is, so they prefer recent content in answers.",
  "freshness|archive":
    "Archive or “all releases” pages show agents you maintain historical content and give them a single place to discover past items.",
  "irchecklist|checklist":
    "Each item (filings, presentation, press, events, contact, governance) gives agents an authoritative place to link to when answering investor questions.",
};

function key(category: string, subcategory?: string): string {
  const c = category.toLowerCase().replace(/\s+/g, "");
  const s = (subcategory ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${c}|${s}`;
}

/** Returns a short, specific "why it matters" for this finding. Different per subcategory so rows aren’t repetitive. */
export function getFindingWhyItMatters(category: string, subcategory?: string): string {
  const k = key(category, subcategory);
  if (FINDING_WHY[k]) return FINDING_WHY[k];
  // Try category-only for known subcategories we didn’t map (e.g. specific schema type)
  const c = category.toLowerCase().replace(/\s+/g, "");
  if (c === "structureddata" && subcategory?.toLowerCase().includes("json")) return FINDING_WHY["structureddata|json-ld"];
  if (c === "crawlability") return FINDING_WHY["crawlability|crawl"];
  if (c === "structureddata") return FINDING_WHY["structureddata|feeds"];
  if (c === "parseability") return FINDING_WHY["parseability|content"];
  if (c === "freshness") return FINDING_WHY["freshness|dates"];
  if (c === "irchecklist") return FINDING_WHY["irchecklist|checklist"];
  return "This signal helps answer engines and AI agents discover and use your IR content.";
}

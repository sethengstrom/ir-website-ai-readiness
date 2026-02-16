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
  { what: string; why: string; scoreMeaning: string; improvements: string[] }
> = {
  crawlability: {
    what: "Whether robots.txt and sitemaps allow discovery of your IR section, and how many IR-related URLs we find.",
    why: "AI crawlers and answer engines need to discover your IR pages. Blocking /investors or /investor-relations in robots.txt, or having no sitemap, makes it harder for systems to index and cite your content.",
    scoreMeaning: "100 = robots.txt reachable, IR paths not disallowed, sitemap reachable, and multiple IR URLs discovered. Lower scores indicate blocks or poor discoverability.",
    improvements: [
      "Ensure robots.txt is reachable and does not Disallow: /investors or /investor-relations.",
      "Publish a sitemap (e.g. sitemap.xml) and reference it in robots.txt or at the root.",
      "Use clear IR paths (e.g. /investor, /investors, /ir) so crawlers and the sitemap can discover them.",
    ],
  },
  structuredData: {
    what: "JSON-LD schema (Organization, NewsArticle, Event, etc.), machine-readable dates (datePublished/dateModified), identity (name, logo, url), and RSS/Atom feeds.",
    why: "Schema designed for LLMs—Organization with identity, dates in schema, BreadcrumbList—makes it easier for AI to cite your content with correct attribution and dates. Feeds give agents a machine-friendly list of news and events.",
    scoreMeaning: "Higher scores reward Organization/Corporation with name+url/logo, datePublished/dateModified in schema, BreadcrumbList, ticker symbol, and feeds. Sites built for AI answer engines score best here.",
    improvements: [
      "Add at least one RSS or Atom feed for IR content (press releases, events, or news) and link it with <link rel=\"alternate\" type=\"application/rss+xml\" … />.",
      "Use Organization or Corporation JSON-LD with name and url (or logo); add tickerSymbol for the stock ticker.",
      "Add datePublished and dateModified in JSON-LD (e.g. on WebPage or NewsArticle) so AI can cite dates.",
      "Add BreadcrumbList JSON-LD on key IR pages.",
      "Use multiple relevant schema types (e.g. NewsArticle, Event, FAQPage) where they fit the content.",
    ],
  },
  parseability: {
    what: "Server-rendered text length, ratio of main content to boilerplate, headings (H1/H2), and canonical URLs.",
    why: "AI systems need clear, substantial text to extract facts and quotes. Heavy boilerplate, thin content, or missing headings make it harder to understand and cite your pages. Canonicals reduce duplicate-content confusion.",
    scoreMeaning: "100 = substantial main content, good content ratio, clear headings, and canonical tags on key pages. Lower scores suggest thin or noisy pages.",
    improvements: [
      "Serve meaningful, server-rendered main content (e.g. in <main> or [role=\"main\"]) with at least ~500 characters of text.",
      "Use one H1 and at least one H2 per page so structure is clear.",
      "Add <link rel=\"canonical\" href=\"…\" /> on key IR pages.",
      "Include unique <title> and meta name=\"description\" on every page.",
      "Keep main content ratio high (avoid wrapping most text in nav/footer so boilerplate dominates).",
    ],
  },
  freshness: {
    what: "Signals that help AI cite current, dated IR content: an earnings/results hub, visible dates on that hub and other pages, and clear structure for past content.",
    why: "AI needs to find the right page for earnings answers and see when content is from so it can cite 'as of Q3 2025' and avoid stale snippets. Visible dates and a clear hub make your content more likely to be used in answers.",
    scoreMeaning: "100 = earnings hub present, hub has a visible date, other pages show dates, and archive/releases-style URLs. Lower scores mean weaker signals for AI to cite current content.",
    improvements: [
      "Add a clear earnings or financial results hub (terms like earnings, results, quarter, webcast, transcript).",
      "Show a visible date on the earnings hub page (e.g. YYYY-MM-DD or 'Q3 2025') so AI can cite recency.",
      "Show visible dates (e.g. YYYY-MM-DD) or datePublished/dateModified in JSON-LD on press releases and event pages.",
      "Provide archive or all releases / past events pages (URLs containing archive, releases, or events).",
    ],
  },
  irChecklist: {
    what: "Presence of filings (SEC/EDGAR or SEDAR+), investor presentation, press releases, events/webcasts, IR contact, and governance/ESG links.",
    why: "Complete IR coverage gives AI and agents the full picture—filings, presentations, news, events, and governance—so they can answer questions accurately and link to authoritative sources.",
    scoreMeaning: "100 = all six elements present (filings, presentation, press, events, contact, governance). Score is the share of these we detected.",
    improvements: [
      "Link to SEC/EDGAR, SEDAR+, or a clear filings / financial reports page.",
      "Link to an investor presentation or investor deck.",
      "Link to press releases, newsroom, or announcements.",
      "Link to events, webcasts, or earnings call info.",
      "Provide visible IR contact (e.g. investor relations, IR@ email).",
      "Link to governance, ESG, sustainability, or board information.",
    ],
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
  "structureddata|ir/llm-friendly":
    "Schema built for LLMs—Organization identity, machine-readable dates, breadcrumbs, ticker—helps AI cite your IR content correctly and use it as a source for user answers.",
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
  "response|http":
    "Healthy HTTP status (2xx) means the page is reachable; agents and crawlers can access your content.",
  "response|timing":
    "Faster response times improve crawl efficiency and user experience when agents or users request your pages.",
  "response|headers":
    "Last-Modified helps agents and caches know when content was updated, so they can prefer fresh data.",
  "parseability|meta":
    "Title and meta description help agents and search engines understand and summarize the page.",
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

/** Map finding category (from analyzer) to CATEGORY_CONTEXT key. */
function findingCategoryToKey(category: string): string {
  const c = category.toLowerCase().replace(/\s+/g, "");
  if (c === "crawlability") return "crawlability";
  if (c === "structureddata") return "structuredData";
  if (c === "parseability") return "parseability";
  if (c === "freshness") return "freshness";
  if (c === "ircompleteness") return "irChecklist";
  return c;
}

/**
 * Per-category triggers: when a failed finding's subcategory or signal matches a trigger,
 * we include the corresponding improvement for that domain.
 */
const IMPROVEMENT_TRIGGERS: Record<
  string,
  { triggers: string[]; improvement: string }[]
> = {
  crawlability: [
    { triggers: ["robots", "disallow", "reachable"], improvement: "Ensure robots.txt is reachable and does not Disallow: /investors or /investor-relations." },
    { triggers: ["sitemap"], improvement: "Publish a sitemap (e.g. sitemap.xml) and reference it in robots.txt or at the root." },
    { triggers: ["crawl", "url", "IR-related"], improvement: "Use clear IR paths (e.g. /investor, /investors, /ir) so crawlers and the sitemap can discover them." },
  ],
  structuredData: [
    { triggers: ["feed", "rss", "atom"], improvement: "Add at least one RSS or Atom feed for IR content and link it with <link rel=\"alternate\" type=\"application/rss+xml\" … />." },
    { triggers: ["Organization", "Corporation", "identity"], improvement: "Use Organization or Corporation JSON-LD with name and url (or logo); add tickerSymbol for the stock ticker." },
    { triggers: ["datePublished", "dateModified", "dates"], improvement: "Add datePublished and dateModified in JSON-LD (e.g. on WebPage or NewsArticle) so AI can cite dates." },
    { triggers: ["BreadcrumbList", "breadcrumb"], improvement: "Add BreadcrumbList JSON-LD on key IR pages." },
    { triggers: ["No JSON-LD", "Schema types"], improvement: "Use multiple relevant schema types (e.g. NewsArticle, Event, FAQPage) where they fit the content." },
  ],
  parseability: [
    { triggers: ["length", "chars", "content", "ratio"], improvement: "Serve meaningful, server-rendered main content (e.g. in <main>) with at least ~500 characters of text." },
    { triggers: ["H1", "H2", "heading"], improvement: "Use one H1 and at least one H2 per page so structure is clear." },
    { triggers: ["canonical"], improvement: "Add <link rel=\"canonical\" href=\"…\" /> on key IR pages." },
    { triggers: ["Title", "Meta", "description"], improvement: "Include unique <title> and meta name=\"description\" on every page." },
  ],
  freshness: [
    { triggers: ["earnings", "hub", "results"], improvement: "Add a clear earnings or financial results hub (terms like earnings, results, quarter, webcast)." },
    { triggers: ["earnings hub page has no visible date", "no visible or schema date", "visible date"], improvement: "Show a visible date on the earnings hub page (e.g. YYYY-MM-DD or Q3 2025) or add datePublished/dateModified in JSON-LD so AI can cite recency." },
    { triggers: ["dates", "pages with dates"], improvement: "Show visible dates (e.g. YYYY-MM-DD) or add datePublished/dateModified in JSON-LD on press releases and event pages." },
    { triggers: ["archive", "releases", "events"], improvement: "Provide archive or all releases / past events pages (URLs containing archive, releases, or events)." },
  ],
  irChecklist: [
    { triggers: ["Filings", "SEC", "EDGAR"], improvement: "Link to SEC/EDGAR, SEDAR+, or a clear filings / financial reports page." },
    { triggers: ["presentation", "deck"], improvement: "Link to an investor presentation or investor deck." },
    { triggers: ["press", "release", "newsroom"], improvement: "Link to press releases, newsroom, or announcements." },
    { triggers: ["event", "webcast"], improvement: "Link to events, webcasts, or earnings call info." },
    { triggers: ["contact", "IR contact"], improvement: "Provide visible IR contact (e.g. investor relations, IR@ email)." },
    { triggers: ["governance", "ESG"], improvement: "Link to governance, ESG, sustainability, or board information." },
  ],
};

/**
 * Returns improvement suggestions for a given category based on this domain's failed findings.
 * When a failed finding matches a trigger, we include that improvement; otherwise we fall back to the full list.
 */
export function getImprovementsForDomain(
  categoryKey: string,
  findings: { category: string; subcategory?: string; signal: string; passed: boolean }[]
): string[] {
  const ctx = CATEGORY_CONTEXT[categoryKey];
  const fullList = ctx?.improvements ?? [];
  const triggers = IMPROVEMENT_TRIGGERS[categoryKey];
  if (!triggers?.length) return fullList;

  const relevant = findings.filter(
    (f) => findingCategoryToKey(f.category) === categoryKey && !f.passed
  );
  if (relevant.length === 0) return fullList;

  const added = new Set<string>();
  const out: string[] = [];
  for (const f of relevant) {
    const combined = ((f.subcategory ?? "") + " " + f.signal).toLowerCase();
    for (const { triggers: t, improvement } of triggers) {
      if (t.some((trigger) => combined.includes(trigger.toLowerCase()))) {
        if (!added.has(improvement)) {
          added.add(improvement);
          out.push(improvement);
        }
        break;
      }
    }
  }
  return out.length > 0 ? out : fullList;
}

export type CriteriaStatus = { improvement: string; passed: boolean | null };

/**
 * Returns all criteria for a category with pass/fail for this domain.
 * passed: true = at least one matching finding passed and none failed; false = at least one failed; null = no matching finding.
 */
export function getCriteriaStatusForDomain(
  categoryKey: string,
  findings: { category: string; subcategory?: string; signal: string; passed: boolean }[]
): CriteriaStatus[] {
  const triggers = IMPROVEMENT_TRIGGERS[categoryKey];
  if (!triggers?.length) return [];

  const relevant = findings.filter(
    (f) => findingCategoryToKey(f.category) === categoryKey
  );

  return triggers.map(({ triggers: t, improvement }) => {
    const matching = relevant.filter((f) => {
      const combined = ((f.subcategory ?? "") + " " + f.signal).toLowerCase();
      return t.some((trigger) => combined.includes(trigger.toLowerCase()));
    });
    if (matching.length === 0) return { improvement, passed: null };
    const anyFailed = matching.some((m) => !m.passed);
    return { improvement, passed: !anyFailed };
  });
}

export type FindingCriterion = { label: string; passed: boolean; improvement?: string };

/**
 * Returns each finding in this category as its own criterion with pass/fail.
 * This aligns the criteria list with the actual checks that drive the score, so ✓/✗ count matches the score.
 * Optional improvement hint is added for failed findings when a trigger matches.
 */
export function getCategoryFindingsForDomain(
  categoryKey: string,
  findings: { category: string; subcategory?: string; signal: string; passed: boolean }[]
): FindingCriterion[] {
  const relevant = findings
    .filter((f) => findingCategoryToKey(f.category) === categoryKey)
    .map((f) => {
      let improvement: string | undefined;
      if (!f.passed) {
        const triggers = IMPROVEMENT_TRIGGERS[categoryKey];
        const combined = ((f.subcategory ?? "") + " " + f.signal).toLowerCase();
        const match = triggers?.find(({ triggers: t }) =>
          t.some((trigger) => combined.includes(trigger.toLowerCase()))
        );
        if (match) improvement = match.improvement;
      }
      return { label: f.signal, passed: f.passed, improvement };
    });
  return relevant;
}

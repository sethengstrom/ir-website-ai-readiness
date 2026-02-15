import Link from "next/link";

export const metadata = {
  title: "Scoring methodology | IR AI Readiness Scanner",
  description: "How the IR AI Readiness Scanner scores domains for AI citation readiness and investor question coverage.",
};

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link
            href="/"
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            ← Back to scanner
          </Link>
          <h1 className="text-2xl font-bold text-white mt-2">
            Scoring methodology
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            How we measure AI citation readiness and category scores
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-10">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Overview</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            The scanner compares two domains for <strong className="text-zinc-300">investor relations (IR) AI readiness</strong>—how well a site can be discovered, parsed, and cited by AI assistants and answer engines. We fetch a limited set of pages per domain (no deep crawl), then run deterministic analyzers. All scores are 0–100.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Primary score: AI Citation Readiness</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            The main number shown is <strong className="text-zinc-300">AI Citation Readiness</strong>. It is weighted to reflect how likely an AI system is to find and cite your IR content when answering investor questions.
          </p>
          <ul className="list-disc list-inside text-zinc-400 text-sm space-y-1 ml-2">
            <li><strong className="text-zinc-300">70%</strong> — Investor question coverage (share of 12 high-impact questions that are answerable or partially answerable from fetched pages)</li>
            <li><strong className="text-zinc-300">20%</strong> — Crawlability and parseability (average of the two category scores; can the site be reached and read?)</li>
            <li><strong className="text-zinc-300">10%</strong> — Structured data (JSON-LD + feeds; helps agents cite with correct attribution and dates)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Investor question coverage (12 questions)</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            We test 12 common investor questions per domain. For each question we scan the fetched pages (homepage, /investor, and up to 2 discovered “earnings hub” links) and look for evidence: links, numbers, or text snippets. Each question is scored as:
          </p>
          <ul className="list-disc list-inside text-zinc-400 text-sm space-y-1 ml-2 mb-3">
            <li><strong className="text-emerald-400">Answerable</strong> — Relevant page found, citable URL, and evidence snippet (and for revenue/EPS, a numeric extraction).</li>
            <li><strong className="text-amber-400">Partial</strong> — Right hub or link found but missing the actual answer (e.g. link to earnings page but no revenue number on fetched pages).</li>
            <li><strong className="text-zinc-500">Not answerable</strong> — No relevant page or evidence within the request limits.</li>
          </ul>
          <p className="text-zinc-500 text-sm mb-2">The 12 questions:</p>
          <ol className="list-decimal list-inside text-zinc-400 text-sm space-y-1 ml-2">
            <li>Most recent quarterly revenue</li>
            <li>Latest EPS</li>
            <li>Next earnings call date/time</li>
            <li>Earnings press release link</li>
            <li>Earnings webcast/replay link</li>
            <li>Earnings transcript link</li>
            <li>Latest investor presentation / slide deck</li>
            <li>SEC filings (10-K/10-Q)</li>
            <li>Stock ticker</li>
            <li>Fiscal year end</li>
            <li>CEO / leadership page</li>
            <li>IR contact</li>
          </ol>
          <p className="text-zinc-400 text-sm leading-relaxed mt-3">
            For revenue and EPS we use regex-based extraction (e.g. $1.2 billion, EPS of 1.23, diluted EPS) and prefer evidence from pages that also contain earnings context (earnings, results, quarter, etc.). The coverage score is (answerable + 0.5 × partial) / 12 × 100.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Crawl process</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            Per domain we do a two-phase fetch (max 6 requests total, 8s timeout each):
          </p>
          <ul className="list-disc list-inside text-zinc-400 text-sm space-y-1 ml-2">
            <li><strong className="text-zinc-300">Phase 1 (4 requests):</strong> Homepage, robots.txt, sitemap.xml, /investor.</li>
            <li><strong className="text-zinc-300">Phase 2 (up to 2 requests):</strong> From phase 1 HTML we collect same-origin links whose URL or anchor matches earnings-related terms (earnings, results, quarterly, q1–q4, webcast, replay, transcript, press-release, financials, etc.). We rank them deterministically and fetch up to 2 additional pages to improve earnings-question coverage.</li>
          </ul>
          <p className="text-zinc-400 text-sm leading-relaxed mt-3">
            Only HTML from successful responses is used for analysis. No sitemap traversal or recursive crawl.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Category scores (Overall AI Readiness)</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            The secondary “Overall AI Readiness” score is a weighted blend of five categories. Each category is 0–100; the blend is:
          </p>
          <ul className="list-disc list-inside text-zinc-400 text-sm space-y-1 ml-2 mb-4">
            <li><strong className="text-zinc-300">Crawlability (20%)</strong> — robots.txt reachable, /investors and /investor-relations not disallowed, sitemap reachable, IR-related URLs discovered.</li>
            <li><strong className="text-zinc-300">Structured data (20%)</strong> — JSON-LD schema types (Organization, WebPage, Event, etc.), machine-readable dates, Organization identity, RSS/Atom feeds. The “Structured Data Score” shown in the UI is JSON-LD only (no feeds).</li>
            <li><strong className="text-zinc-300">Parseability (20%)</strong> — Server-rendered text length, main-content ratio, H1/H2 structure, canonical URL, title and meta description.</li>
            <li><strong className="text-zinc-300">Recency &amp; dates (15%)</strong> — Earnings/results hub detected, visible date on that hub (so AI can cite recency), dates on other pages, archive/releases-style URLs.</li>
            <li><strong className="text-zinc-300">IR checklist (25%)</strong> — Presence of filings (SEC/EDGAR or SEDAR+), investor presentation, press releases, events/webcasts, IR contact, governance/ESG links.</li>
          </ul>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Response metrics (HTTP status, response time, Last-Modified) are reported as findings but do not feed into the overall category blend.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Structured data (JSON-LD) breakdown</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            The “Structured Data Score” (JSON-LD only) is computed from: presence of application/ld+json, valid parse, @context, @type, coverage of recommended IR types (Organization or Corporation, WebSite, WebPage, FAQPage, NewsArticle, Event, BreadcrumbList), and field completeness (name, url, datePublished, headline, description, sameAs, logo). Feeds are not included in this score; they are part of the blended “Structured data” category score used in Overall AI Readiness.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">Limitations</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            The scanner uses a shallow fetch and deterministic rules (regex, link patterns, heuristics). It does not use an LLM. Results depend on the small set of URLs we fetch; if key content lives on paths we never request (e.g. a different earnings URL), we will report “Not answerable” or “Partial.” Scores are intended for comparison and improvement guidance, not as a guarantee of how any specific AI system will cite a site.
          </p>
        </section>

        <p className="pt-4 border-t border-zinc-800">
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 text-sm">
            ← Back to scanner
          </Link>
        </p>
      </main>
    </div>
  );
}

import Link from "next/link";
import { APP_VERSION } from "@/lib/version";

export const metadata = {
  title: "Scoring methodology | IR AI Readiness Scanner",
  description: "How the IR AI Readiness Scanner scores domains for AI citation readiness and investor question coverage.",
};

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)] bg-[var(--card)]/50">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link
            href="/"
            className="text-sm text-[var(--accent)] hover:opacity-90"
          >
            ← Back to scanner
          </Link>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mt-2">
            Scoring methodology
          </h1>
          <p className="text-[var(--muted)] text-base mt-1">
            How we measure AI citation readiness and category scores
          </p>
          <p className="text-[var(--muted)] text-sm mt-1">
            Last updated: February 2025
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-4 py-8 space-y-10" tabIndex={-1}>
        <section>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Overview</h2>
          <p className="text-[var(--muted)] text-base leading-relaxed">
            The scanner compares two domains for <strong className="text-[var(--foreground)]">investor relations (IR) AI readiness</strong>—how well a site can be discovered, parsed, and cited by AI assistants and answer engines. We fetch a limited set of pages per domain (deep crawl: up to 3 IR pages and 20 earnings/events links), then run deterministic analyzers. All scores are 0–100.
          </p>
          <p className="text-[var(--muted)] text-base leading-relaxed mt-3">
            We do not execute JavaScript; we only see the same initial HTML that many LLMs and answer engines see when they fetch a URL (e.g. for citation or RAG). A lot of AI retrieval runs without a headless browser—so a site that relies entirely on client-rendered content will score poorly here, and that reflects how it would perform for those systems. The scanner therefore measures readiness for the common case where the AI sees only server-rendered content.
          </p>
        </section>

        <section id="understanding-scores">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Understanding your scores</h2>
          <p className="text-[var(--muted)] text-base leading-relaxed">
            Scores are based on <strong className="text-[var(--foreground)]">server-rendered HTML only</strong>. We do not run a headless browser or execute JavaScript. When you look at your site in a normal browser, you see the full page after scripts run—including navigation and content that’s injected by React, Vue, or similar. We only see the initial HTML the server sends. Many AI systems and answer engines fetch pages the same way (no JavaScript), so our scores reflect what they would typically see.
          </p>
          <p className="text-[var(--muted)] text-base leading-relaxed mt-3">
            If a score is lower than you expect—especially <strong className="text-[var(--foreground)]">IR checklist</strong>, which looks for links like “SEC Filings” or “Events” in the HTML—it often means we didn’t find those links in the initial response, not that your site is missing them. Client-rendered navigation is very common; the score is telling you how your site looks to systems that don’t run a browser. Use the breakdown and the links below to see exactly what we measured and how to improve for that world.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Primary score: Overall readiness</h2>
          <p className="text-[var(--muted)] text-base leading-relaxed mb-3">
            The main number shown is <strong className="text-[var(--foreground)]">Overall readiness</strong>: how well the IR site is configured for LLMs to use it as a source for common investor questions. It is <strong className="text-[var(--foreground)]">50% investor question coverage</strong> (share of 12 high-impact questions answerable or partially answerable from fetched pages) plus <strong className="text-[var(--foreground)]">50% technical foundation</strong> (a weighted blend of the five category scores below). So the big number reflects both “can an LLM answer?” and “is the site technically ready?”
          </p>
          <p className="text-[var(--muted)] text-base leading-relaxed mb-3">
            We also show <strong className="text-[var(--foreground)]">AI Citation Readiness</strong> as a secondary metric (under the main number). It uses a different blend to emphasize answerability: 70% question coverage, 20% crawlability and parseability, 10% structured data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Investor question coverage (12 questions)</h2>
          <p className="text-[var(--muted)] text-base leading-relaxed mb-3">
            We test 12 common investor questions per domain. For each question we scan the fetched pages (homepage, up to 3 IR pages from discovery or your URL, and up to 20 earnings/events/presentations links) and look for evidence: links, numbers, or text snippets. Each question is scored as:
          </p>
          <ul className="list-disc list-inside text-[var(--muted)] text-base space-y-1 ml-2 mb-3">
            <li><strong className="text-emerald-400">Answerable</strong> — Relevant page found, citable URL, and evidence snippet (and for revenue/EPS, a numeric extraction).</li>
            <li><strong className="text-amber-400">Partial</strong> — Right hub or link found but missing the actual answer (e.g. link to earnings page but no revenue number on fetched pages).</li>
            <li><strong className="text-[var(--muted)]">Not answerable</strong> — No relevant page or evidence within the request limits.</li>
          </ul>
          <p className="text-[var(--muted)] text-base mb-2">The 12 questions:</p>
          <ol className="list-decimal list-inside text-[var(--muted)] text-base space-y-1 ml-2">
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
          <p className="text-[var(--muted)] text-base leading-relaxed mt-3">
            For revenue and EPS we use regex-based extraction (e.g. $1.2 billion, EPS of 1.23, diluted EPS) and prefer evidence from pages that also contain earnings context (earnings, results, quarter, etc.). The coverage score is (answerable + 0.5 × partial) / 12 × 100.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Crawl process</h2>
          <p className="text-[var(--muted)] text-base leading-relaxed mb-3">
            Per domain we do a deep two-phase fetch (25s per request; scans typically complete in under a minute). Progress updates are shown during crawl and analysis.
          </p>
          <ul className="list-disc list-inside text-[var(--muted)] text-base space-y-1 ml-2">
            <li><strong className="text-[var(--foreground)]">Phase 1a (3 requests):</strong> Homepage, robots.txt, sitemap.xml. If not at root, we try the first Sitemap: from robots.txt.</li>
            <li><strong className="text-[var(--foreground)]">IR page discovery:</strong> We choose up to 3 IR URLs from the site when you do not paste a full URL (homepage nav, then sitemap, then conventional path). We fetch them and one fallback if the first fails.</li>
            <li><strong className="text-[var(--foreground)]">Phase 2 (up to 20 requests):</strong> From phase 1 HTML we collect same-origin links that match earnings-related terms. We rank them and fetch up to 20 additional pages, one at a time, with progress updates.</li>
          </ul>
          <p className="text-[var(--muted)] text-base leading-relaxed mt-3">
            Only HTML from successful responses is used for analysis. No sitemap traversal or recursive crawl. Discovery from nav and sitemap improves accuracy for sites that use non-standard IR paths.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Category scores (feed into the technical half of Overall readiness)</h2>
          <p className="text-[var(--muted)] text-base leading-relaxed mb-3">
            The five category scores below are 0–100 each. Their weighted blend is the <strong className="text-[var(--foreground)]">technical foundation</strong> (50% of Overall readiness). Weights:
          </p>
          <ul className="list-disc list-inside text-[var(--muted)] text-base space-y-1 ml-2 mb-4">
            <li><strong className="text-[var(--foreground)]">Crawlability (20%)</strong> — robots.txt reachable, /investors, /investor-relations, /investor, and /ir not disallowed, sitemap reachable, IR-related URLs discovered.</li>
            <li><strong className="text-[var(--foreground)]">Structured data (20%)</strong> — JSON-LD schema types (Organization, WebPage, Event, etc.), machine-readable dates, Organization identity, RSS/Atom feeds. The table row shows this full category score; the caption under that row also shows “JSON-LD only” for transparency.</li>
            <li><strong className="text-[var(--foreground)]">Parseability (20%)</strong> — Server-rendered text length, main-content ratio, H1/H2 structure, canonical URL, title and meta description.</li>
            <li><strong className="text-[var(--foreground)]">Freshness (15%)</strong> — Earnings/results hub detected, visible or schema date on that hub (so AI can cite recency), dates on other pages, archive/releases-style URLs.</li>
            <li><strong className="text-[var(--foreground)]">IR checklist (25%)</strong> — Presence of filings (SEC/EDGAR or SEDAR+), investor presentation, press releases, events/webcasts, IR contact, governance/ESG links.</li>
          </ul>
          <p className="text-[var(--muted)] text-base leading-relaxed">
            Response metrics (HTTP status, response time, Last-Modified) are reported as findings but do not feed into the overall category blend.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Structured data (JSON-LD) breakdown</h2>
          <p className="text-[var(--muted)] text-base leading-relaxed">
            The “JSON-LD only” value (shown in the Structured data row caption) is computed from: presence of application/ld+json, valid parse, @context, @type, coverage of recommended IR types (Organization or Corporation, WebSite, WebPage, FAQPage, NewsArticle, Event, BreadcrumbList), and field completeness (name, url, datePublished, headline, description, sameAs, logo). Feeds are not included in that value; they are part of the full “Structured data” category score that feeds into Overall readiness.
          </p>
        </section>

        <section id="limitations">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Limitations</h2>
          <p className="text-[var(--muted)] text-base leading-relaxed">
            The scanner uses a shallow fetch and deterministic rules (regex, link patterns, heuristics). It does not use an LLM and does not execute JavaScript. We only see server-rendered HTML—so links or content that appear only after client-side rendering (e.g. in a React/Vue nav) may be reported as missing even when they exist on the live site. Results depend on the small set of URLs we fetch; if key content lives on paths we never request (e.g. a different earnings URL), we will report “Not answerable” or “Partial.” Scores are intended for comparison and improvement guidance, not as a guarantee of how any specific AI system will cite a site.
          </p>
          <p className="text-[var(--muted)] text-base leading-relaxed mt-3">
            <strong className="text-[var(--foreground)]">Why can IR checklist be 0 when those items are on the site?</strong> The checklist looks only at links (<code className="text-sm bg-[var(--card)] px-1 rounded">a href</code>) in the initial HTML we receive. Many IR sites serve a minimal HTML shell and build the whole nav with JavaScript. We then never see links like SEC Filings or Events—they appear only after the app runs in the browser. So 0 here means we did not find matching links in the HTML we got, not that the site has no IR content.
          </p>
          <p className="text-[var(--muted)] text-base leading-relaxed mt-3">
            <strong className="text-[var(--foreground)]">Why might results differ between scans?</strong> Our logic is deterministic (same URLs, same ordering), but results can change because: (1) <strong>Blocking or rate limiting</strong>—some sites block or throttle automated requests (by IP, User-Agent, or request rate). We use a browser-like User-Agent, but WAFs (e.g. Cloudflare, Akamai) or bot protection may still return 403, 429, or an error page. A second scan soon after can then get fewer pages or different content. (2) <strong>Time-varying content</strong>—the site may serve different HTML (A/B tests, cache, or updated sitemap) so we discover or analyze different pages. (3) <strong>Transient failures</strong>—timeouts or network errors can mean one run gets a page and the next does not. So a lower score on a later scan often means the site or network responded differently, not that our scoring changed.
          </p>
        </section>

        <p className="pt-4 border-t border-[var(--card-border)] flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/" className="text-[var(--accent)] hover:opacity-90 text-sm">
            ← Back to scanner
          </Link>
          <Link href="/changelog" className="text-[var(--muted)] hover:text-[var(--foreground)] text-sm" title="Changelog">
            v{APP_VERSION}
          </Link>
        </p>
      </main>
    </div>
  );
}

# Changelog

All notable changes to the IR AI Readiness Scanner are summarized here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for the version in `package.json`.

---

## [0.3.0] - 2025-02-18

### Changed

- **Thorough crawl:** Scans are slower and more thorough. Per domain: up to **2** IR entry pages (when discovery yields multiple), up to **8** phase-2 earnings/events/presentations links (was 2), **20s** per-request timeout (was 12s), **120s** total scan timeout (was 60s). API `maxDuration` increased to 60s. More earnings candidates are considered (15 per page) so phase-2 has more URLs to choose from. Typical page count per domain is now up to ~12–14 HTML pages instead of 3–4.
- **README and methodology** updated to describe the thorough crawl and new timeouts.

---

## [0.2.0] - 2025-02-13

### Added

- **IR page discovery from the site:** When the user does not paste a full URL, the scanner now discovers the IR entry URL from the site instead of guessing path names. Order: (1) user-provided path, (2) IR-looking links in the homepage’s server-rendered navigation (text, href, title, aria-label), (3) IR-related URLs from the sitemap, (4) conventional paths (`/investors` for IR subdomains, else `/investor`). This improves accuracy for sites that use non-standard IR paths.
- **Version number** in the app footer (discrete link to this changelog).
- **CHANGELOG.md** (this file) summarizing all revisions.

### Changed

- **Crawl flow:** Phase 1 is now two steps: fetch homepage, robots.txt, and sitemap.xml first; then decide the IR URL via discovery and fetch it (with one fallback if it fails). Same max request count; no extra round-trips for discovery.
- **Methodology and README** updated to describe discovery from nav and sitemap.

---

## [0.1.0] - Earlier

### Added

- **Crawler fallback IR path:** If the initial IR URL (e.g. `/investor`) returns 404 or non-HTML and the user did not supply a path, the scanner tries one fallback: `/investors`→`/investor` or `/investor`→`/investor-relations`.
- **Robots and crawlability:** Checks for `/investor` and `/ir` in addition to `/investors` and `/investor-relations`. Crawlability score includes findings for all four paths not disallowed.
- **Freshness:** “Investor relations” in the page title is treated as a strong signal for the earnings-hub heuristic so typical IR landing pages are more likely to pass.
- **IR checklist:** Link matching uses `title` and `aria-label` in addition to text and href, so nav items that only expose labels via attributes are detected.
- **Methodology:** “Limitations” section documents that the scanner does not execute JavaScript and only sees server-rendered HTML; crawlability bullet lists all four paths.

### Fixed

- **IR checklist TypeScript:** Resolved `linkSearchString` callback parameter type for Cheerio compatibility (build passes).

---

[0.3.0]: https://github.com/ir-ai-readiness/ir-ai-readiness-scanner/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ir-ai-readiness/ir-ai-readiness-scanner/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ir-ai-readiness/ir-ai-readiness-scanner/releases/tag/v0.1.0

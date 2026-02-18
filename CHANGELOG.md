# Changelog

All notable changes to the IR AI Readiness Scanner are summarized here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for the version in `package.json`.

---

## [0.3.0] - 2025-02-18

### Changed

- **Deep crawl:** Deeper and slower. Per domain: up to **3** IR entry pages, up to **14** phase-2 earnings/events/presentations links (fetched sequentially with per-link progress). **25s** per-request timeout, **240s** total scan timeout. API `maxDuration` 120s. Phase-2 fetches one URL at a time so the UI can show “Fetching earnings & events link 1 of 14…”, etc. Typical page count per domain up to ~20 HTML pages.
- **Progress messaging:** Crawler and analyzer accept optional `onProgress(message)` callbacks. Scan route runs domains **sequentially** (Domain A then Domain B) and streams frequent progress events: “Fetching homepage, robots.txt & sitemap…”, “Discovering IR pages…”, “Fetching earnings & events link 3 of 14…”, “Analyzing crawlability…”, “Evaluating investor question coverage…”, etc. Progress bar advances with each step so the scan clearly looks like it’s working.
- **README and methodology** updated for deep crawl and progress behavior.

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

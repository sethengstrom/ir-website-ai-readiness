# Improving scoring accuracy for any IR site

This document summarizes improvements we can make so the scanner scores **any** site a user enters more accurately for AEO (Answer Engine Optimization), based on patterns observed across many IR sites (including large-cap S&P 500 examples).

---

## 1. Discovery: finding the right IR page when the user doesn’t paste a full URL

**Today:** If the user enters only a domain (e.g. `investor.apple.com` or `company.com`), we fetch one assumed path: `/investors` for hostnames like `investor.*`, `ir.*`, `investors.*`, `stock.*`; otherwise `/investor`. Many sites use other paths.

**Observed patterns:**
- `/investor-relations` (e.g. Apple)
- `/investor-information` or `/en-us/investor/...` (locale in path, e.g. Microsoft)
- Root `/` on a dedicated IR host (e.g. ir.tesla.com, ir.aboutamazon.com)
- Shared IR domains with company path (e.g. investor.shareholder.com/**jpmorganchase**)

**Improvements to consider:**
- **Try multiple candidate paths when the first fails:** If the first request returns 404 or non-HTML, try the next path from a short list (e.g. `/investors` → `/investor` → `/investor-relations` → `/`). Keeps request count bounded while improving discovery.
- **Treat root as valid IR page for IR subdomains:** For hostnames like `ir.*` or `investor.*`, we already fetch the homepage as URL 1; the 4th URL is currently `/investors`. If that 4th request often 404s (many use root only), we could try `/` as the 4th when the host is an IR subdomain so we don’t waste a request, or try `/` before `/investors` for those hosts. Needs a small crawler change and care not to double-fetch.
- **Document in UI/methodology:** Encourage users to paste the full IR URL when they know it (e.g. from their nav) for best accuracy; presets are just quick examples.

---

## 2. IR checklist: SEC filings, press releases, events, etc.

**Today:** We search server-rendered HTML only (no JavaScript). We match link text, href, and (after recent changes) `title` and `aria-label`, with broad patterns for filings, press, events, contact, governance.

**Why we can miss items that “are clearly on the site”:**
- **Client-rendered navigation:** If links exist only after JS runs (e.g. React/Vue nav), we never see them. This is a structural limitation unless we add a headless browser.
- **Wording and structure:** Some sites use “Regulatory filings”, “Disclosure”, “Financials”, “News” (we’ve added many of these). A few more variants may help.

**Improvements to consider:**
- **Methodology/UI copy:** State clearly that we only see server-rendered HTML; nav that is built entirely in JavaScript may not be detected, so a “fail” can mean “not found in initial HTML” rather than “not present on the site.”
- **Optional extra patterns:** If we see repeated false negatives (e.g. “Financial information”, “Reports & filings”), add one or two more regex variants so we better capture common wording across many sites.

---

## 3. Freshness and earnings hub

**Today:** We detect an “earnings hub” by keywords in path, title, and body (score ≥ 3). We prefer a canonical IR page when several match, use tiered “pages with dates,” and give partial credit when the IR landing exists but doesn’t match the hub heuristic.

**Improvements already in place:** Lower threshold, stable hub choice, tiered dates, partial credit—all help consistency and reduce run-to-run variance.

**Further improvements to consider:**
- **Broader earnings wording:** Add phrases like “quarterly update”, “financial update”, “results and reports” if we see strong IR pages that don’t quite reach threshold.
- **Treat “investor relations” in title as a strong signal:** Many IR landings have “Investor Relations” in the title; we could give a fixed boost so those pages are more likely to count as the hub when combined with minimal body signals.

---

## 4. Crawlability (robots.txt)

**Today:** We only check whether `/investors` and `/investor-relations` are disallowed. Some sites disallow `/investor` or `/ir` or use different path names.

**Improvement to consider:** Check a small set of path variants (e.g. `/investor`, `/investors`, `/investor-relations`, `/ir`) or “any path segment containing ‘investor’ or ‘ir’”, and report if any are blocked, so we don’t under-penalize sites that use a different path name.

---

## 5. Structured data and JSON-LD

**Today:** We use JSON-LD for scoring and for **values** (ticker, event dates, contact, org name, schema dates) in investor questions and findings. This already improves accuracy for any site that marks up data.

**Improvement to consider:** Ensure we consistently flatten `@graph` and handle nested structures in all JSON-LD consumers (we’ve done this in several places; a quick audit would confirm we don’t miss Organization/Event in graphs anywhere).

---

## 6. Summary: highest-impact changes for “any site”

| Area | Change | Effect |
|------|--------|--------|
| **Discovery** | Try 2–3 fallback IR paths on 404 (e.g. /investors → /investor → /investor-relations) | More sites get the right page when user enters only domain |
| **Discovery** | For IR subdomains, consider trying root before /investors to avoid wasted 404 | Better use of request budget; fewer “no hub” due to wrong path |
| **Checklist** | Document “no JS” limitation in methodology and/or in-app | Sets correct expectation; reduces confusion when nav is client-only |
| **Checklist** | Add 1–2 more wording variants if we see patterns (e.g. “reports & filings”) | Fewer false negatives on wording |
| **Crawlability** | Extend robots check to /investor and /ir (and optionally path-containing) | Fairer crawlability score for different path naming |
| **Freshness** | Optional: “Investor Relations” in title as strong hub signal; 1–2 more earnings phrases | Slightly more robust hub detection across varied sites |

Keeping presets as **short, generic examples** (e.g. Alphabet, Netflix, Tesla, NVIDIA, Workday, Tetra Tech, Emera) keeps the app focused on being robust for any URL users paste or type, while the above changes improve accuracy regardless of which site they enter.

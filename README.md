# IR AI Readiness Scanner

Next.js App Router MVP that compares two domains for **investor relations (IR) AI/agent retrieval readiness**. No LLM usage—analysis is rule- and heuristic-based.

## User flow

1. User enters **Domain A** and **Domain B** (e.g. `example.com` or `https://example.com`).
2. App crawls each domain (sitemap-first; fallback shallow crawl depth 3 from likely IR paths).
3. App analyzes pages for AI/agent retrieval signals and outputs an overall **0–100 score** with subscores.

## Signals detected

| Category | Signals |
|----------|--------|
| **Crawlability** | robots.txt reachable; whether it disallows `/investors` or `/investor-relations`; sitemap.xml reachable; sitemap index + child sitemaps; count of IR-related URLs in sitemap and crawl |
| **Structured data** | JSON-LD blocks and schema types (FAQPage, QAPage, NewsArticle, PressRelease, Event, Organization); RSS/Atom feeds (link tags) |
| **Parseability** | Server-rendered text length; ratio of boilerplate to main content; H1/H2 headings; canonical tags |
| **Freshness** | “Latest earnings” hub (earnings, results, quarter, webcast, transcript); dates on press/events; archive pages |
| **IR completeness** | Filings (SEC/EDGAR, SEDAR+); investor presentation; press releases/newsroom; events/webcasts; IR contact; governance/ESG |

## Output

- **Side-by-side dashboard** with overall and category scores (0–100).
- **Findings table** per domain: each finding has evidence (URL, snippet, detection method).

## Tech stack

- **Next.js** (App Router), **TypeScript**, **Tailwind CSS**
- **Server routes** for crawling and analysis
- **Prisma** with **SQLite** (local); easy switch to **Postgres** for deploy
- **cheerio** for HTML/XML parsing

## Requirements

- Node.js 18+
- npm or yarn

## Setup

```bash
# Install dependencies
npm install

# Configure database (default: SQLite)
cp .env.example .env
# Edit .env if needed; DATABASE_URL defaults to file:./dev.db

# Create DB and generate Prisma client
npm run db:push
npm run db:generate
```

## Run

```bash
# Development
npm run dev
# Open http://localhost:3000

# Production build
npm run build
npm start
```

## Deploy (Postgres)

1. Set `DATABASE_URL` to your Postgres connection string, e.g.  
   `postgresql://user:password@host:5432/ir_scanner?schema=public`
2. Change Prisma datasource in `prisma/schema.prisma`:
   - `provider = "postgresql"`
   - Keep `url = env("DATABASE_URL")`
3. Run migrations (or `npx prisma db push`) against the Postgres DB.

No code changes are required beyond the schema provider and env.

## Crawler behavior

- **Robots.txt**: Fetched and parsed; disallow for `/investors` and `/investor-relations` is checked; crawl scope respects these rules.
- **Rate limiting**: 500 ms between requests; configurable in `src/lib/crawler.ts`.
- **Timeouts**: 10–15 s per request; retries (2) with backoff.
- **URLs**: Normalized (no hash, sorted query); same-domain only.
- **Sitemap**: Tries `sitemap.xml`, `sitemap_index.xml`, etc.; follows sitemap index to child sitemaps; collects IR-related URLs first, then fills up to a page limit.

## Project structure

```
src/
  app/
    api/scan/route.ts    # POST: run crawl + analyze for domain A & B
    api/runs/route.ts    # GET: list past runs
    layout.tsx
    page.tsx             # Dashboard UI
    globals.css
  lib/
    crawler.ts           # Sitemap-first + fallback crawl
    robots.ts            # robots.txt fetch/parse
    sitemap.ts           # Sitemap discovery + parse
    url-utils.ts         # Normalization, same-domain, IR path heuristics
    db.ts                # Prisma singleton
    types.ts             # Finding, DomainResult, CategoryScores
    analyze/
      index.ts           # Orchestrates analyzers, computes overall score
      crawlability.ts
      structured-data.ts
      parseability.ts
      freshness.ts
      ir-checklist.ts
prisma/
  schema.prisma
```

## License

MIT.

import type { CrawlResult } from "../crawler";
import type { Finding } from "../types";

export function analyzeCrawlability(result: CrawlResult): { score: number; findings: Finding[] } {
  const findings: Finding[] = [];
  let score = 0;
  let total = 0;

  // robots.txt reachable
  total += 1;
  if (result.robots.reachable) {
    score += 1;
    findings.push({
      category: "Crawlability",
      subcategory: "robots.txt",
      signal: "robots.txt reachable",
      score: 100,
      evidence: { url: `${result.origin}/robots.txt`, method: "robots_txt" },
      passed: true,
    });
  } else {
    findings.push({
      category: "Crawlability",
      subcategory: "robots.txt",
      signal: "robots.txt not reachable",
      score: 0,
      evidence: { url: `${result.origin}/robots.txt`, method: "robots_txt" },
      passed: false,
    });
  }

  // robots does not disallow /investors
  total += 1;
  if (!result.robots.disallowsInvestors) {
    score += 1;
    findings.push({
      category: "Crawlability",
      subcategory: "robots.txt",
      signal: "/investors not disallowed",
      score: 100,
      evidence: { snippet: "No Disallow: /investors", method: "robots_txt" },
      passed: true,
    });
  } else {
    findings.push({
      category: "Crawlability",
      subcategory: "robots.txt",
      signal: "/investors is disallowed",
      score: 0,
      evidence: { snippet: "Disallow: /investors", method: "robots_txt" },
      passed: false,
    });
  }

  // robots does not disallow /investor-relations
  total += 1;
  if (!result.robots.disallowsInvestorRelations) {
    score += 1;
    findings.push({
      category: "Crawlability",
      subcategory: "robots.txt",
      signal: "/investor-relations not disallowed",
      score: 100,
      evidence: { snippet: "No Disallow: /investor-relations", method: "robots_txt" },
      passed: true,
    });
  } else {
    findings.push({
      category: "Crawlability",
      subcategory: "robots.txt",
      signal: "/investor-relations is disallowed",
      score: 0,
      evidence: { snippet: "Disallow: /investor-relations", method: "robots_txt" },
      passed: false,
    });
  }

  // sitemap reachable
  total += 1;
  if (result.sitemap.reachable) {
    score += 1;
    findings.push({
      category: "Crawlability",
      subcategory: "sitemap",
      signal: "sitemap.xml reachable",
      score: 100,
      evidence: { url: result.sitemap.childSitemaps[0] || `${result.origin}/sitemap.xml`, method: "sitemap_xml" },
      passed: true,
    });
  } else {
    findings.push({
      category: "Crawlability",
      subcategory: "sitemap",
      signal: "sitemap.xml not reachable",
      score: 0,
      evidence: { url: `${result.origin}/sitemap.xml`, method: "sitemap_xml" },
      passed: false,
    });
  }

  // IR URLs in sitemap (score by count: 0 = 0, 1+ = 50, 5+ = 80, 10+ = 100)
  total += 1;
  const irInSitemap = result.sitemap.irUrlCount;
  const irSitemapScore = irInSitemap >= 10 ? 100 : irInSitemap >= 5 ? 80 : irInSitemap >= 1 ? 50 : 0;
  score += irSitemapScore / 100;
  findings.push({
    category: "Crawlability",
    subcategory: "sitemap",
    signal: `IR-related URLs in sitemap: ${irInSitemap}`,
    score: irSitemapScore,
    evidence: { snippet: `Count: ${irInSitemap}`, method: "sitemap_xml" },
    passed: irInSitemap >= 1,
  });

  // IR-related URLs discovered from crawl (contributes to score so criteria match)
  total += 1;
  const crawlOk = result.irUrlsFromCrawl.length >= 1;
  const crawlScore = crawlOk ? 1 : 0;
  score += crawlScore;
  findings.push({
    category: "Crawlability",
    subcategory: "crawl",
    signal: `Total IR-related URLs from crawl: ${result.irUrlsFromCrawl.length}`,
    score: crawlOk ? 100 : Math.min(100, result.irUrlsFromCrawl.length * 10),
    evidence: { snippet: `Crawled ${result.pages.length} pages`, method: "crawl" },
    passed: crawlOk,
  });

  const categoryScore = total > 0 ? Math.round((score / total) * 100) : 0;
  return { score: Math.min(100, categoryScore), findings };
}

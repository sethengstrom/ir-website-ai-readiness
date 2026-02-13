/**
 * Fetch and parse robots.txt. Respect disallow for /investors and /investor-relations.
 */

const DEFAULT_USER_AGENT = "IR-AI-Readiness-Scanner/1.0";

export interface RobotsResult {
  reachable: boolean;
  disallowsInvestors: boolean;
  disallowsInvestorRelations: boolean;
  rawContent: string | null;
  sitemapUrls: string[];
}

export async function fetchRobots(origin: string): Promise<RobotsResult> {
  const result: RobotsResult = {
    reachable: false,
    disallowsInvestors: false,
    disallowsInvestorRelations: false,
    rawContent: null,
    sitemapUrls: [],
  };

  const url = `${origin.replace(/\/$/, "")}/robots.txt`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": DEFAULT_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return result;
    const text = await res.text();
    result.reachable = true;
    result.rawContent = text;

    const lines = text.split(/\r?\n/).map((l) => l.trim());
    let inRelevantGroup = false;
    for (const line of lines) {
      if (/^user-agent:\s*\*/i.test(line)) {
        inRelevantGroup = true;
        continue;
      }
      if (/^user-agent:/i.test(line) && !/^\s*\*/i.test(line.split(":")[1])) {
        inRelevantGroup = false;
      }
      if (inRelevantGroup) {
        const disallow = line.match(/^disallow:\s*(.+)/i);
        if (disallow) {
          const path = disallow[1].trim().toLowerCase();
          if (path.includes("investor") || path === "/investors" || path === "/investors/")
            result.disallowsInvestors = true;
          if (
            path.includes("investor-relations") ||
            path === "/investor-relations" ||
            path === "/investor-relations/"
          )
            result.disallowsInvestorRelations = true;
        }
        const sitemap = line.match(/^sitemap:\s*(.+)/i);
        if (sitemap) result.sitemapUrls.push(sitemap[1].trim());
      }
      // Sitemap can appear outside User-agent
      const sitemap = line.match(/^sitemap:\s*(.+)/i);
      if (sitemap) result.sitemapUrls.push(sitemap[1].trim());
    }
  } catch {
    // leave result as default
  }
  return result;
}

/**
 * Extract logo/favicon URL from crawled page HTML.
 * Prefers: apple-touch-icon > icon > shortcut icon > JSON-LD Organization logo > /favicon.ico
 */

import * as cheerio from "cheerio";

export function extractFaviconUrl(html: string, origin: string): string | null {
  const $ = cheerio.load(html);
  const base = origin.replace(/\/$/, "");

  const selectors = [
    'link[rel="apple-touch-icon"]',
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
  ];
  for (const sel of selectors) {
    const href = $(sel).first().attr("href");
    if (href) {
      try {
        return new URL(href, origin).href;
      } catch {
        continue;
      }
    }
  }

  let jsonLdLogo: string | null = null;
  try {
    $('script[type="application/ld+json"]').each((_, el) => {
      if (jsonLdLogo) return;
      const text = $(el).html()?.trim();
      if (!text) return;
      try {
        const data = JSON.parse(text);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const type = item["@type"];
          const types = Array.isArray(type) ? type : type ? [type] : [];
          if (types.some((t: string) => t === "Organization")) {
            const logo = item.logo;
            if (logo) {
              const url = typeof logo === "string" ? logo : logo?.url ?? logo?.contentUrl;
              if (url) {
                jsonLdLogo = new URL(url, origin).href;
                return;
              }
            }
          }
        }
      } catch {
        // ignore
      }
    });
    if (jsonLdLogo) return jsonLdLogo;
  } catch {
    // ignore
  }

  return `${base}/favicon.ico`;
}

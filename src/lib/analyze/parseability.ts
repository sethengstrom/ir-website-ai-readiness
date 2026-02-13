import * as cheerio from "cheerio";
import type { CrawlPage } from "../crawler";
import type { Finding } from "../types";

function getMainContent(html: string): { text: string; boilerplate: string } {
  const $ = cheerio.load(html);
  // Remove script, style, nav, footer
  $("script, style, nav, footer, header form, [role='navigation'], .nav, .footer, .header").remove();
  const body = $("body").text() || "";
  const main = $("main, article, [role='main'], .content, #content, .main").text() || "";
  const mainClean = main.replace(/\s+/g, " ").trim();
  const bodyClean = body.replace(/\s+/g, " ").trim();
  const boilerplate = bodyClean.length > mainClean.length ? bodyClean.length - mainClean.length : 0;
  return { text: mainClean || bodyClean, boilerplate: bodyClean };
}

export function analyzeParseability(pages: CrawlPage[]): { score: number; findings: Finding[] } {
  const findings: Finding[] = [];
  let totalScore = 0;
  let count = 0;

  const keyPages = pages.slice(0, 10);

  for (const page of keyPages) {
    const $ = cheerio.load(page.html);
    const { text, boilerplate } = getMainContent(page.html);

    const textLength = text.length;
    const hasMeaningfulLength = textLength >= 500;
    const h1 = $("h1").length;
    const h2 = $("h2").length;
    const hasHeadings = h1 >= 1 && (h1 + h2) >= 2;
    const canonical = $('link[rel="canonical"]').attr("href");

    totalScore += hasMeaningfulLength ? 25 : Math.min(25, (textLength / 500) * 25);
    totalScore += hasHeadings ? 25 : (h1 + h2) > 0 ? 12 : 0;
    totalScore += canonical ? 25 : 0;
    count += 3;

    findings.push({
      category: "Parseability",
      subcategory: "Content",
      signal: `Server-rendered text length: ${textLength} chars`,
      score: hasMeaningfulLength ? 100 : Math.min(100, (textLength / 500) * 100),
      evidence: { url: page.url, snippet: text.slice(0, 120) + (text.length > 120 ? "…" : ""), method: "html_parse" },
      passed: hasMeaningfulLength,
    });

    const ratio = boilerplate.length > 0 ? text.length / boilerplate.length : 1;
    findings.push({
      category: "Parseability",
      subcategory: "Content",
      signal: `Main content ratio: ${(ratio * 100).toFixed(0)}%`,
      score: ratio >= 0.3 ? 100 : ratio >= 0.15 ? 50 : 0,
      evidence: { url: page.url, method: "html_parse" },
      passed: ratio >= 0.2,
    });

    findings.push({
      category: "Parseability",
      subcategory: "Headings",
      signal: `H1: ${h1}, H2: ${h2}`,
      score: hasHeadings ? 100 : (h1 + h2) > 0 ? 50 : 0,
      evidence: { url: page.url, method: "html_parse" },
      passed: hasHeadings,
    });

    if (canonical) {
      findings.push({
        category: "Parseability",
        subcategory: "Canonical",
        signal: "Canonical tag present",
        score: 100,
        evidence: { url: page.url, snippet: canonical, method: "canonical" },
        passed: true,
      });
    }
  }

  const withCanonical = keyPages.filter((p) => cheerio.load(p.html)('link[rel="canonical"]').length > 0).length;
  const canonScore = keyPages.length ? (withCanonical / keyPages.length) * 100 : 0;
  findings.push({
    category: "Parseability",
    subcategory: "Canonical",
    signal: `Pages with canonical: ${withCanonical}/${keyPages.length}`,
    score: Math.round(canonScore),
    evidence: { method: "canonical" },
    passed: withCanonical >= 1,
  });

  const avgScore = count > 0 ? totalScore / (count / 3) : 0;
  const score = Math.round(Math.min(100, avgScore + canonScore) / 2);
  return { score: Math.min(100, score), findings };
}

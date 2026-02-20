/**
 * One-off: crawl a URL, run hosting detection, print debug fields.
 * Usage: npx tsx scripts/debug-hosting.ts <url>
 */
import { crawlDomain } from "../src/lib/crawler";
import { analyzeDomain } from "../src/lib/analyze";

const url = process.argv[2] || "https://abc.xyz/investor";

async function main() {
  console.log("Crawling", url, "...\n");
  const crawl = await crawlDomain(url, { onProgress: (m) => console.log(m) });
  const first = crawl.pages[0];
  if (first) {
    const q4cdnCount = (first.html.match(/q4cdn/gi) || []).length;
    console.log("\nFirst page:", first.url, "| html length:", first.html?.length ?? 0, "| fetchQuality:", first.fetchQuality ?? "(none)", "| 'q4cdn' count:", q4cdnCount);
  }
  console.log("\nAnalyzing...");
  const analyzed = await analyzeDomain(crawl, { onProgress: (m) => console.log(m) });
  const h = analyzed.irHosting;
  if (!h) {
    console.log("No irHosting result.");
    return;
  }
  console.log("\n--- IR Host result ---");
  console.log("irHostProvider:", h.irHostProvider);
  console.log("confidence:", h.confidence);
  console.log("toolsFeedsProvider:", h.toolsFeedsProvider ?? "(none)");
  console.log("\n--- Debug (why this host) ---");
  console.log("debugDecisiveSignal:", h.debugDecisiveSignal ?? "(none)");
  console.log("debugSourcePage:", h.debugSourcePage ?? "(none)");
  console.log("debugHostReason:", h.debugHostReason ?? "(none)");
  console.log("debugVendorScores:", h.debugVendorScores ? JSON.stringify(h.debugVendorScores, null, 2) : "(none)");
  console.log("debugProbeGates:", h.debugProbeGates ? JSON.stringify(h.debugProbeGates, null, 2) : "(none)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

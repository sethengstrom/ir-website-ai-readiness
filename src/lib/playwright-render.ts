/**
 * Optional single-page Playwright render fallback for IR host detection.
 * When fetch quality is JS-shell, use PLAYWRIGHT_RENDER=1 (and install playwright)
 * to capture rendered DOM and network hostnames for vendor fingerprinting.
 *
 * Install: npm install -D playwright  (or add to devDependencies)
 * Enable:  PLAYWRIGHT_RENDER=1
 */

export interface PlaywrightRenderResult {
  html: string;
  networkHosts: string[];
  finalUrl: string;
}

const RENDER_TIMEOUT_MS = 15000;
const WAIT_AFTER_LOAD_MS = 2000;

/**
 * If PLAYWRIGHT_RENDER=1 and Playwright is available, loads the URL in headless Chromium,
 * waits for load + brief settle, returns rendered HTML and hostnames from requests.
 * Otherwise returns null (no-op).
 */
export async function renderWithPlaywright(url: string): Promise<PlaywrightRenderResult | null> {
  if (process.env.PLAYWRIGHT_RENDER !== "1") return null;

  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    return null;
  }

  const networkHosts = new Set<string>();
  let browser: import("playwright").Browser | null = null;

  try {
    browser = await playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    page.on("request", (req) => {
      try {
        const u = req.url();
        const host = new URL(u).hostname;
        if (host) networkHosts.add(host.toLowerCase());
      } catch {
        // ignore
      }
    });

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: RENDER_TIMEOUT_MS,
    });
    await new Promise((r) => setTimeout(r, WAIT_AFTER_LOAD_MS));

    const html = await page.content();
    const finalUrl = page.url();

    await context.close();

    return {
      html,
      networkHosts: Array.from(networkHosts),
      finalUrl: response?.url() || finalUrl,
    };
  } catch {
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

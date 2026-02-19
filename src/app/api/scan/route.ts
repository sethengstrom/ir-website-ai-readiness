export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Deep crawl: sequential domains, many progress updates. Typically under 1 min; timeout 4 min for slow sites.
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { SCAN_ERROR_CODES, messageForCode, isScanErrorCode } from "@/lib/scan-errors";

const CACHE_DAYS = 7;
/** Set to true to return cached results for same domain pair within CACHE_DAYS. Disabled while scans are fast. */
const USE_CACHE = false;

/** Global scan timeout so deep crawl (sequential, many pages) can complete. */
const SCAN_TIMEOUT_MS = 240_000;

/** Rate limit: max requests per IP per window. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitByIp = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  let timestamps = rateLimitByIp.get(ip) ?? [];
  timestamps = timestamps.filter((t) => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  timestamps.push(now);
  rateLimitByIp.set(ip, timestamps);
  return true;
}

function normalizeDomainInput(input: string): string {
  const s = input.trim().toLowerCase();
  if (!s) return "";
  const url = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (!host || host.length > 253) return "";
    let path = parsed.pathname.replace(/\/+/g, "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    parsed.pathname = path || "/";
    return parsed.toString();
  } catch {
    return "";
  }
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    return errorResponse(
      SCAN_ERROR_CODES.RATE_LIMIT_EXCEEDED,
      messageForCode(SCAN_ERROR_CODES.RATE_LIMIT_EXCEEDED),
      429
    );
  }

  try {
    const [{ prisma }, { crawlDomain }, { analyzeDomain }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/crawler"),
      import("@/lib/analyze"),
    ]);

    const body = await request.json();
    const domainA = normalizeDomainInput(body.domainA ?? "");
    const domainBRaw = body.domainB != null ? normalizeDomainInput(String(body.domainB).trim()) : "";
    const domainB = domainBRaw || "";
    const singleDomain = !domainB;

    if (!domainA) {
      return errorResponse(
        SCAN_ERROR_CODES.INVALID_DOMAIN,
        "domainA is required and must be valid.",
        400
      );
    }

    if (USE_CACHE && !singleDomain) {
      const cacheCutoff = new Date();
      cacheCutoff.setDate(cacheCutoff.getDate() - CACHE_DAYS);
      const cached = await prisma.scanRun.findFirst({
        where: {
          status: "completed",
          finishedAt: { not: null, gte: cacheCutoff },
          domainB: { not: "" },
          OR: [{ domainA, domainB }, { domainA: domainB, domainB: domainA }],
        },
        orderBy: { finishedAt: "desc" },
      });
      if (cached?.resultA && cached?.resultB && cached.finishedAt) {
        return NextResponse.json({
          runId: cached.id,
          resultA: JSON.parse(cached.resultA) as unknown,
          resultB: JSON.parse(cached.resultB) as unknown,
          cached: true,
          cachedAt: cached.finishedAt.toISOString(),
        });
      }
    }

    const run = await prisma.scanRun.create({
      data: {
        domainA,
        domainB: domainB || "",
        status: "running",
      },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

        try {
          let progress = 0;
          const sendProgress = (message: string, p?: number) => {
            if (p !== undefined) progress = p;
            send({
              type: "progress",
              phase: progress < 40 ? "crawling" : progress < 72 ? "crawling" : "analyzing",
              message,
              progress,
            });
          };

          sendProgress("Starting deep scan…", 2);

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("SCAN_TIMEOUT")), SCAN_TIMEOUT_MS)
          );

          sendProgress(singleDomain ? "Crawling domain…" : "Crawling Domain A…", 5);
          let crawlProgress = 8;
          const crawlResultA = await Promise.race([
            crawlDomain(domainA, {
              onProgress: (msg) => {
                crawlProgress = Math.min(38, crawlProgress + 2);
                sendProgress(msg, crawlProgress);
              },
            }),
            timeoutPromise,
          ]);

          let crawlResultB: typeof crawlResultA | null = null;
          if (!singleDomain) {
            sendProgress("Crawling Domain B…", 42);
            crawlProgress = 45;
            crawlResultB = await Promise.race([
              crawlDomain(domainB, {
                onProgress: (msg) => {
                  crawlProgress = Math.min(68, crawlProgress + 2);
                  sendProgress(msg, crawlProgress);
                },
              }),
              timeoutPromise,
            ]);
          }

          sendProgress("Analyzing Domain A (crawlability, structure, content)…", 72);
          let analyzeProgress = 74;
          const resultA = await analyzeDomain(crawlResultA, {
            onProgress: (msg) => {
              analyzeProgress = Math.min(88, analyzeProgress + 3);
              sendProgress(msg, analyzeProgress);
            },
          });

          let resultB = null;
          if (crawlResultB != null) {
            sendProgress("Analyzing Domain B…", 90);
            analyzeProgress = 92;
            resultB = await analyzeDomain(crawlResultB, {
              onProgress: (msg) => {
                analyzeProgress = Math.min(97, analyzeProgress + 2);
                sendProgress(msg, analyzeProgress);
              },
            });
          }

          await prisma.scanRun.update({
            where: { id: run.id },
            data: {
              status: "completed",
              finishedAt: new Date(),
              resultA: JSON.stringify(resultA),
              resultB: resultB != null ? JSON.stringify(resultB) : null,
            },
          });

          send({
            type: "done",
            runId: run.id,
            resultA,
            resultB,
            cached: false,
            progress: 100,
          });
        } catch (e) {
          const err = e as Error & { code?: string };
          if (err instanceof Error && err.message === "SCAN_TIMEOUT") {
            send({
              type: "error",
              code: SCAN_ERROR_CODES.CRAWL_TIMEOUT,
              message: messageForCode(SCAN_ERROR_CODES.CRAWL_TIMEOUT),
            });
          } else if (err.code && isScanErrorCode(err.code)) {
            send({
              type: "error",
              code: err.code,
              message: err.message || messageForCode(err.code),
            });
          } else {
            send({
              type: "error",
              code: SCAN_ERROR_CODES.ANALYZER_ERROR,
              message: err instanceof Error ? err.message : messageForCode(SCAN_ERROR_CODES.SCAN_FAILED),
            });
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("Scan error:", e);
    const err = e as Error & { code?: string };
    if (err.code && isScanErrorCode(err.code)) {
      const status =
        err.code === SCAN_ERROR_CODES.RATE_LIMIT_EXCEEDED
          ? 429
          : err.code === SCAN_ERROR_CODES.INVALID_DOMAIN
            ? 400
            : err.code === SCAN_ERROR_CODES.CRAWL_TIMEOUT
              ? 504
              : 500;
      return errorResponse(err.code, messageForCode(err.code), status);
    }
    if (e instanceof Error && /invalid domain|invalid url/i.test(e.message)) {
      return errorResponse(SCAN_ERROR_CODES.INVALID_DOMAIN, messageForCode(SCAN_ERROR_CODES.INVALID_DOMAIN), 400);
    }
    return errorResponse(
      SCAN_ERROR_CODES.ANALYZER_ERROR,
      e instanceof Error ? e.message : messageForCode(SCAN_ERROR_CODES.SCAN_FAILED),
      500
    );
  }
}

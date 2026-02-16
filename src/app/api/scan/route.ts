export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Parallel fetches keep scan under ~6–8s; 15s allows buffer; global timeout 45s enforced in handler
export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { SCAN_ERROR_CODES, messageForCode, isScanErrorCode } from "@/lib/scan-errors";

const CACHE_DAYS = 7;
/** Set to true to return cached results for same domain pair within CACHE_DAYS. Disabled while scans are fast. */
const USE_CACHE = false;

/** Global scan timeout (45s) so one slow domain doesn't hang the request. */
const SCAN_TIMEOUT_MS = 45_000;

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
    const domainB = normalizeDomainInput(body.domainB ?? "");

    if (!domainA || !domainB) {
      return errorResponse(
        SCAN_ERROR_CODES.INVALID_DOMAIN,
        "domainA and domainB are required and must be valid.",
        400
      );
    }

    if (USE_CACHE) {
      const cacheCutoff = new Date();
      cacheCutoff.setDate(cacheCutoff.getDate() - CACHE_DAYS);
      const cached = await prisma.scanRun.findFirst({
        where: {
          status: "completed",
          finishedAt: { not: null, gte: cacheCutoff },
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
        domainB,
        status: "running",
      },
    });

    const scanPromise = (async () => {
      const [crawlResultA, crawlResultB] = await Promise.all([
        crawlDomain(domainA),
        crawlDomain(domainB),
      ]);
      const resultA = analyzeDomain(crawlResultA);
      const resultB = analyzeDomain(crawlResultB);
      return { crawlResultA, crawlResultB, resultA, resultB };
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("SCAN_TIMEOUT")), SCAN_TIMEOUT_MS);
    });

    const { resultA, resultB } = await Promise.race([scanPromise, timeoutPromise])
      .then((out) => out)
      .catch((e) => {
        if (e instanceof Error && e.message === "SCAN_TIMEOUT") {
          const err = new Error(messageForCode(SCAN_ERROR_CODES.CRAWL_TIMEOUT));
          (err as Error & { code: string }).code = SCAN_ERROR_CODES.CRAWL_TIMEOUT;
          throw err;
        }
        throw e;
      });

    await prisma.scanRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        resultA: JSON.stringify(resultA),
        resultB: JSON.stringify(resultB),
      },
    });

    return NextResponse.json({
      runId: run.id,
      resultA,
      resultB,
      cached: false,
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

import { NextRequest, NextResponse } from "next/server";
import { crawlDomain } from "@/lib/crawler";
import { analyzeDomain } from "@/lib/analyze";
import { prisma } from "@/lib/db";

const CACHE_DAYS = 7;

function normalizeDomainInput(input: string): string {
  const s = input.trim().toLowerCase();
  if (!s) return "";
  const url = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
  try {
    const parsed = new URL(url);
    let path = parsed.pathname.replace(/\/+/g, "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    parsed.pathname = path || "/";
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const domainA = normalizeDomainInput(body.domainA ?? "");
    const domainB = normalizeDomainInput(body.domainB ?? "");

    if (!domainA || !domainB) {
      return NextResponse.json(
        { error: "domainA and domainB are required" },
        { status: 400 }
      );
    }

    const cacheCutoff = new Date();
    cacheCutoff.setDate(cacheCutoff.getDate() - CACHE_DAYS);

    const cached = await prisma.scanRun.findFirst({
      where: {
        status: "completed",
        finishedAt: { not: null, gte: cacheCutoff },
        OR: [
          { domainA, domainB },
          { domainA: domainB, domainB: domainA },
        ],
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

    const run = await prisma.scanRun.create({
      data: {
        domainA,
        domainB,
        status: "running",
      },
    });

    const [crawlResultA, crawlResultB] = await Promise.all([
      crawlDomain(domainA),
      crawlDomain(domainB),
    ]);

    const resultA = analyzeDomain(crawlResultA);
    const resultB = analyzeDomain(crawlResultB);

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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan failed" },
      { status: 500 }
    );
  }
}

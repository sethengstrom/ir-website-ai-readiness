export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/db");
  const run = await prisma.scanRun.findUnique({
    where: { id: runId },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const payload = {
    id: run.id,
    domainA: run.domainA,
    domainB: run.domainB,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    resultA: run.resultA ? (JSON.parse(run.resultA) as unknown) : null,
    resultB: run.resultB ? (JSON.parse(run.resultB) as unknown) : null,
  };

  return NextResponse.json(payload);
}

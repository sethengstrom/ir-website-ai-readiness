export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  const { prisma } = await import("@/lib/db");

  const runs = await prisma.scanRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json(runs);
}

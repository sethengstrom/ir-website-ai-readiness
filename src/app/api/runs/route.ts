import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const runs = await prisma.scanRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return NextResponse.json(runs);
}

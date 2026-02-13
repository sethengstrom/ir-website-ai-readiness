-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL,
    "domainA" TEXT NOT NULL,
    "domainB" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "resultA" TEXT,
    "resultB" TEXT,

    CONSTRAINT "ScanRun_pkey" PRIMARY KEY ("id")
);

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SP100Row } from "@/data/sp100-types";

type SortKey = "company" | "overall" | "irHost" | null;
type SortDir = "asc" | "desc";

function scoreColorClass(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 41) return "text-amber-400";
  return "text-red-400";
}

function ScoreCell({
  value,
  highlight,
}: {
  value: number | null | undefined;
  highlight?: boolean;
}) {
  const base = "px-3 py-2 text-center tabular-nums";
  const highlightClass = highlight ? "bg-emerald-500/10 border-x border-[var(--card-border)]" : "";
  if (value == null)
    return <td className={`${base} text-zinc-500 ${highlightClass}`}>—</td>;
  return (
    <td className={`${base} font-medium ${scoreColorClass(value)} ${highlightClass}`}>
      {value}
    </td>
  );
}

function SortableTh({
  label,
  sortKey,
  currentSort,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="font-semibold text-[var(--foreground)] hover:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 rounded inline-flex items-center gap-1"
      >
        {label}
        {active && <span aria-hidden>{sortDir === "asc" ? " ↑" : " ↓"}</span>}
      </button>
    </th>
  );
}

export default function SP100Table({ rows }: { rows: SP100Row[] }) {
  const [sortBy, setSortBy] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key == null) return;
    setSortBy((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir(key === "overall" ? "desc" : "asc");
      return key;
    });
  };

  const sortedRows = useMemo(() => {
    if (sortBy == null) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "company") {
        cmp = (a.companyName ?? "").localeCompare(b.companyName ?? "");
      } else if (sortBy === "overall") {
        const sa = a.overallScore ?? -1;
        const sb = b.overallScore ?? -1;
        cmp = sa - sb;
      } else if (sortBy === "irHost") {
        const sa = (a.irHostProvider ?? "").toLowerCase();
        const sb = (b.irHostProvider ?? "").toLowerCase();
        cmp = sa.localeCompare(sb);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortBy, sortDir]);

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
      <table className="w-full text-sm border-collapse">
        <caption className="sr-only">
          S&P 100 companies with IR domain, scores, IR host, and action. Sortable by Company, Overall score, and IR host.
        </caption>
        <thead>
          <tr className="bg-[var(--card)]/80 border-b border-[var(--card-border)]">
            <SortableTh
              label="Company"
              sortKey="company"
              currentSort={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
              className="px-3 py-3 text-left"
            />
            <th className="px-3 py-3 text-left font-semibold text-[var(--foreground)]">Ticker</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--foreground)]">IR domain</th>
            <SortableTh
              label="Overall"
              sortKey="overall"
              currentSort={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
              className="px-3 py-3 text-center bg-emerald-500/10 border-x border-[var(--card-border)]"
            />
            <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]">Crawl</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]">Struct</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]">Parse</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]">Fresh</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]">IR list</th>
            <SortableTh
              label="IR host"
              sortKey="irHost"
              currentSort={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
              className="px-3 py-3 text-left"
            />
            <th className="px-3 py-3 text-center font-semibold text-[var(--foreground)]" title="First-page fetch: OK, JS-shell, or blocked/403">
              Fetch
            </th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--foreground)]">Action</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row: SP100Row, i: number) => (
            <tr
              key={`${row.ticker}-${i}`}
              className="border-b border-[var(--card-border)]/70 hover:bg-[var(--card)]/30"
            >
              <td className="px-3 py-2 font-medium text-[var(--foreground)]">{row.companyName}</td>
              <td className="px-3 py-2 text-zinc-400">{row.ticker}</td>
              <td className="px-3 py-2 text-zinc-300">
                {row.domain ? (
                  <a
                    href={row.domain.startsWith("http") ? row.domain : `https://${row.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-emerald-400 hover:text-emerald-300 underline"
                  >
                    {row.domain}
                  </a>
                ) : (
                  <span className="text-zinc-500">—</span>
                )}
              </td>
              <ScoreCell value={row.overallScore ?? undefined} highlight />
              <ScoreCell value={row.categoryScores?.crawlability} />
              <ScoreCell value={row.categoryScores?.structuredData} />
              <ScoreCell value={row.categoryScores?.parseability} />
              <ScoreCell value={row.categoryScores?.freshness} />
              <ScoreCell value={row.categoryScores?.irChecklist} />
              <td className="px-3 py-2 text-zinc-300">
                {row.irHostProvider ? (
                  <span className="text-xs">
                    {row.irHostProvider}
                    {row.toolsFeedsProvider ? ` · ${row.toolsFeedsProvider}` : ""}
                  </span>
                ) : (
                  <span className="text-zinc-500">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-center text-xs">
                {row.fetchQuality ? (
                  <span
                    className={
                      row.fetchQuality === "OK"
                        ? "text-emerald-400"
                        : row.fetchQuality === "blocked"
                          ? "text-red-400"
                          : "text-amber-400"
                    }
                    title={row.fetchQuality === "blocked" ? "Blocked or 403" : row.fetchQuality === "JS-shell" ? "SPA shell, little server HTML" : "OK"}
                  >
                    {row.fetchQuality}
                  </span>
                ) : (
                  <span className="text-zinc-500">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                {row.domain ? (
                  <Link
                    href={`/?domainA=${encodeURIComponent(
                      row.domain.startsWith("http") ? row.domain : `https://${row.domain}`
                    )}`}
                    className="text-emerald-400 hover:text-emerald-300 underline text-xs"
                  >
                    Scan
                  </Link>
                ) : (
                  <span className="text-zinc-500 text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

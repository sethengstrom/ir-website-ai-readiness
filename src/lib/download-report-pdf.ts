import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DomainResult } from "./types";
import { getCategoryFindingsForDomain } from "./aeo-context";

const FONT_SIZE = 10;
const HEADING_FONT_SIZE = 14;
const TITLE_FONT_SIZE = 18;
const MAX_Y = 270;

const CATEGORY_ITEMS = [
  { key: "crawlability" as const, label: "Crawlability" },
  { key: "structuredData" as const, label: "Structured data" },
  { key: "parseability" as const, label: "Parseability" },
  { key: "freshness" as const, label: "Freshness" },
  { key: "irChecklist" as const, label: "IR checklist" },
];

/** ASCII-safe text for PDF (Helvetica has no Unicode symbols). */
function sanitize(text: string): string {
  return String(text)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\u2014/g, "-")
    .replace(/\u203A/g, ">")
    .trim() || "N/A";
}

function shortDomain(url: string, maxLen = 45): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, maxLen);
}

function maybeNewPage(doc: jsPDF, y: number, needSpace = 15): number {
  if (y > MAX_Y - needSpace) {
    doc.addPage();
    return 20;
  }
  return y;
}

export function downloadResultsPdf(resultA: DomainResult, resultB: DomainResult | null): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  let y = 20;

  const singleDomain = resultB == null;
  const domainALabel = shortDomain(resultA.domain);
  const domainBLabel = resultB ? shortDomain(resultB.domain) : "";

  // Title and date
  doc.setFontSize(TITLE_FONT_SIZE);
  doc.text("IR AI Readiness Report", 14, y);
  y += 8;
  doc.setFontSize(FONT_SIZE);
  doc.text(`Generated: ${new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`, 14, y);
  y += 10;

  // Domains (so comparison is clear)
  doc.setFontSize(FONT_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text("Domain A:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(sanitize(domainALabel), 32, y, { maxWidth: pageWidth - 40 });
  y += 6;
  if (resultB) {
    doc.setFont("helvetica", "bold");
    doc.text("Domain B:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(sanitize(domainBLabel), 32, y, { maxWidth: pageWidth - 40 });
    y += 6;
  }
  y += 4;

  // Overall scores
  doc.setFontSize(HEADING_FONT_SIZE);
  doc.text("Overall readiness", 14, y);
  y += 8;

  const overallHeaders = resultB ? ["Metric", "Domain A", "Domain B"] : ["Metric", "Score"];
  const overallBody = resultB
    ? [
        ["Overall readiness", String(resultA.overallScore), String(resultB.overallScore)],
        ["AI Citation", String(resultA.aiCitationReadiness ?? "N/A"), String(resultB.aiCitationReadiness ?? "N/A")],
      ]
    : [
        ["Overall readiness", String(resultA.overallScore)],
        ["AI Citation", String(resultA.aiCitationReadiness ?? "N/A")],
      ];

  autoTable(doc, {
    startY: y,
    head: [overallHeaders],
    body: overallBody,
    theme: "grid",
    styles: { fontSize: FONT_SIZE },
    headStyles: { fillColor: [34, 197, 94] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Category scores
  y = maybeNewPage(doc, y);
  doc.setFontSize(HEADING_FONT_SIZE);
  doc.text("Category scores", 14, y);
  y += 8;

  const catHeaders = resultB ? ["Category", "Domain A", "Domain B"] : ["Category", "Score"];
  const categoryBody = CATEGORY_ITEMS.map(({ key, label }) => {
    const row = [label, String(resultA.categoryScores[key])];
    if (resultB) row.push(String(resultB.categoryScores[key]));
    return row;
  });

  autoTable(doc, {
    startY: y,
    head: [catHeaders],
    body: categoryBody,
    theme: "grid",
    styles: { fontSize: FONT_SIZE },
    headStyles: { fillColor: [34, 197, 94] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Criteria (pass/fail) per category - use words so PDF renders correctly (no Unicode symbols)
  const PASS = "Pass";
  const FAIL = "Fail";
  const NA = "N/A";
  const GREEN_PASS = [34, 197, 94] as [number, number, number];
  const RED_FAIL = [220, 38, 38] as [number, number, number];
  const GRAY_NA = [63, 63, 70] as [number, number, number];
  const WHITE = [255, 255, 255] as [number, number, number];

  doc.setFontSize(11);
  doc.text("Criteria (pass/fail by domain)", 14, y);
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("Green = Pass, Red = Fail, Gray = N/A", 14, y + 5);
  y += 12;

  for (const { key, label } of CATEGORY_ITEMS) {
    y = maybeNewPage(doc, y, 25);
    const criteriaA = getCategoryFindingsForDomain(key, resultA.findings ?? []);
    const criteriaB = resultB ? getCategoryFindingsForDomain(key, resultB.findings ?? []) : [];

    if (criteriaA.length === 0 && criteriaB.length === 0) continue;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(label, 14, y);
    doc.setFont("helvetica", "normal");
    y += 6;

    const labelsA = criteriaA.map((c) => c.label);
    const labelsB = criteriaB.map((c) => c.label);
    const allLabels = [...new Set([...labelsA, ...labelsB])];

    const criteriaRows = allLabels.map((signal) => {
      const a = criteriaA.find((c) => c.label === signal);
      const b = resultB ? criteriaB.find((c) => c.label === signal) : null;
      const passA = a ? (a.passed ? PASS : FAIL) : NA;
      const passB = resultB ? (b ? (b.passed ? PASS : FAIL) : NA) : null;
      const row = [sanitize(signal.slice(0, 50)), passA];
      if (resultB) row.push(passB ?? NA);
      return row;
    });

    const critHeaders = resultB ? ["Criterion", "Domain A", "Domain B"] : ["Criterion", "Pass/Fail"];
    const passFailColIndices = resultB ? [1, 2] : [1];
    autoTable(doc, {
      startY: y,
      head: [critHeaders],
      body: criteriaRows,
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [63, 63, 70] },
      columnStyles: resultB ? { 0: { cellWidth: "auto" }, 1: { cellWidth: 22 }, 2: { cellWidth: 22 } } : { 0: { cellWidth: "auto" } },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const colIdx = data.column.index;
        if (!passFailColIndices.includes(colIdx)) return;
        const raw = data.cell?.raw as string | undefined;
        const text = (raw ?? String(data.cell?.text ?? "")).trim();
        if (text === PASS) {
          data.cell.styles.fillColor = GREEN_PASS;
          data.cell.styles.textColor = WHITE;
        } else if (text === FAIL) {
          data.cell.styles.fillColor = RED_FAIL;
          data.cell.styles.textColor = WHITE;
        } else {
          data.cell.styles.fillColor = GRAY_NA;
          data.cell.styles.textColor = WHITE;
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  y += 4;

  // Investor question coverage - use words for PDF (no Unicode symbols)
  const coverageA = resultA.investorQuestionCoverage;
  if (coverageA?.questionResults?.length) {
    y = maybeNewPage(doc, y, 30);
    doc.setFontSize(HEADING_FONT_SIZE);
    doc.text("Investor question coverage", 14, y);
    y += 6;
    doc.setFontSize(8);
    doc.text("Answerable = found; Partial = some evidence; Not = not answerable", 14, y);
    y += 8;

    const qHeaders = resultB
      ? ["#", "Question", "Domain A", "Domain B"]
      : ["#", "Question", "Status"];
    const statusLabel = (s: string) => (s === "answerable" ? "Answerable" : s === "partial" ? "Partial" : "Not");
    const qBody = coverageA.questionResults.map((r, i) => {
      if (resultB) {
        const rb = resultB.investorQuestionCoverage?.questionResults?.find((x) => x.id === r.id);
        return [String(i + 1), sanitize(r.question.slice(0, 55)), statusLabel(r.status), rb ? statusLabel(rb.status) : "N/A"];
      }
      return [String(i + 1), sanitize(r.question.slice(0, 55)), statusLabel(r.status)];
    });

    autoTable(doc, {
      startY: y,
      head: [qHeaders],
      body: qBody,
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [34, 197, 94] },
      columnStyles: resultB ? { 1: { cellWidth: 72 }, 2: { cellWidth: 20 }, 3: { cellWidth: 20 } } : { 1: { cellWidth: "auto" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Findings summary — per domain pass/fail counts when comparing
  y = maybeNewPage(doc, y, 25);
  doc.setFontSize(HEADING_FONT_SIZE);
  doc.text("Findings summary", 14, y);
  y += 8;

  const byCategory = (findings: DomainResult["findings"]) => {
    const out: Record<string, { passed: number; failed: number }> = {};
    for (const f of findings ?? []) {
      const cat = f.subcategory ? `${f.category} › ${f.subcategory}` : f.category;
      if (!out[cat]) out[cat] = { passed: 0, failed: 0 };
      if (f.passed) out[cat].passed++;
      else out[cat].failed++;
    }
    return out;
  };

  const catA = byCategory(resultA.findings);
  const allCats = new Set([...Object.keys(catA), ...(resultB ? Object.keys(byCategory(resultB.findings)) : [])]);

  if (resultB) {
    const catB = byCategory(resultB.findings);
    const findingRows = Array.from(allCats).map((cat) => [
      sanitize(cat.slice(0, 35)),
      String(catA[cat]?.passed ?? 0),
      String(catA[cat]?.failed ?? 0),
      String(catB[cat]?.passed ?? 0),
      String(catB[cat]?.failed ?? 0),
    ]);
    autoTable(doc, {
      startY: y,
      head: [["Category", "A Pass", "A Fail", "B Pass", "B Fail"]],
      body: findingRows,
      theme: "grid",
      styles: { fontSize: FONT_SIZE },
      headStyles: { fillColor: [34, 197, 94] },
    });
  } else {
    const findingRows = Array.from(allCats).map((cat) => [
      sanitize(cat.slice(0, 45)),
      String(catA[cat]?.passed ?? 0),
      String(catA[cat]?.failed ?? 0),
    ]);
    autoTable(doc, {
      startY: y,
      head: [["Category", "Passed", "Failed"]],
      body: findingRows,
      theme: "grid",
      styles: { fontSize: FONT_SIZE },
      headStyles: { fillColor: [34, 197, 94] },
    });
  }
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Footer on first page only
  doc.setPage(1);
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    "IR AI Readiness Scanner - How ready your IR site is for AI to answer investor questions. Scan results may be cached.",
    14,
    287,
    { maxWidth: pageWidth - 28 }
  );

  const safe = (s: string) => s.replace(/[^a-z0-9.-]/gi, "-").replace(/-+/g, "-").slice(0, 25);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = singleDomain
    ? `IR-Readiness-${safe(domainALabel)}-${dateStr}.pdf`
    : `IR-Readiness-${safe(domainALabel)}-vs-${safe(domainBLabel)}-${dateStr}.pdf`;
  doc.save(filename);
}

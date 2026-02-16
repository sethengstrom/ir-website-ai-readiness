import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DomainResult } from "./types";

const FONT_SIZE = 10;
const HEADING_FONT_SIZE = 14;
const TITLE_FONT_SIZE = 18;

function sanitize(text: string): string {
  return String(text).replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").trim() || "—";
}

export function downloadResultsPdf(resultA: DomainResult, resultB: DomainResult | null): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210; // A4 width in mm
  let y = 20;

  // Title
  doc.setFontSize(TITLE_FONT_SIZE);
  doc.text("IR AI Readiness Report", 14, y);
  y += 10;

  doc.setFontSize(FONT_SIZE);
  doc.text(`Generated: ${new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`, 14, y);
  y += 12;

  const singleDomain = resultB == null;
  const domainAShort = resultA.domain.replace(/^https?:\/\//, "").slice(0, 50);

  // Overall scores table
  doc.setFontSize(HEADING_FONT_SIZE);
  doc.text("Overall scores", 14, y);
  y += 8;

  const overallHeadersFinal = resultB ? ["Metric", "Domain A", "Domain B"] : ["Metric", "Score"];
  const overallBodyFinal = resultB
    ? [
        ["Overall readiness", String(resultA.overallScore), String(resultB.overallScore)],
        ["AI Citation", String(resultA.aiCitationReadiness ?? "—"), String(resultB.aiCitationReadiness ?? "—")],
      ]
    : [
        ["Overall readiness", String(resultA.overallScore)],
        ["AI Citation", String(resultA.aiCitationReadiness ?? "—")],
      ];

  autoTable(doc, {
    startY: y,
    head: [overallHeadersFinal],
    body: overallBodyFinal,
    theme: "grid",
    styles: { fontSize: FONT_SIZE },
    headStyles: { fillColor: [34, 197, 94] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Category scores
  doc.setFontSize(HEADING_FONT_SIZE);
  doc.text("Category scores", 14, y);
  y += 8;

  const categoryLabels = ["Crawlability", "Structured data", "Parseability", "Freshness", "IR checklist"];
  const keys = ["crawlability", "structuredData", "parseability", "freshness", "irChecklist"] as const;
  const categoryBody = keys.map((key, i) => {
    const row = [categoryLabels[i], String(resultA.categoryScores[key])];
    if (resultB) row.push(String(resultB.categoryScores[key]));
    return row;
  });
  const catHeaders = resultB ? ["Category", "Domain A", "Domain B"] : ["Category", "Score"];

  autoTable(doc, {
    startY: y,
    head: [catHeaders],
    body: categoryBody,
    theme: "grid",
    styles: { fontSize: FONT_SIZE },
    headStyles: { fillColor: [34, 197, 94] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Investor question coverage summary
  const coverageA = resultA.investorQuestionCoverage;
  if (coverageA?.questionResults?.length) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(HEADING_FONT_SIZE);
    doc.text("Investor question coverage", 14, y);
    y += 8;

    const qHeaders = resultB
      ? ["#", "Question", "Domain A", "Domain B"]
      : ["#", "Question", "Status"];
    const statusLabel = (s: string) => (s === "answerable" ? "Answerable" : s === "partial" ? "Partial" : "Not");
    const qBody = coverageA.questionResults.map((r, i) => {
      if (resultB) {
        const rb = resultB.investorQuestionCoverage?.questionResults?.find((x) => x.id === r.id);
        return [String(i + 1), sanitize(r.question.slice(0, 60)), statusLabel(r.status), rb ? statusLabel(rb.status) : "—"];
      }
      return [String(i + 1), sanitize(r.question.slice(0, 60)), statusLabel(r.status)];
    });

    autoTable(doc, {
      startY: y,
      head: [qHeaders],
      body: qBody,
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [34, 197, 94] },
      columnStyles: resultB ? { 1: { cellWidth: 70 } } : { 1: { cellWidth: "auto" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Findings summary (counts by category)
  if (resultA.findings?.length && y < 260) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(HEADING_FONT_SIZE);
    doc.text("Findings summary", 14, y);
    y += 8;

    const byCategory: Record<string, { passed: number; failed: number }> = {};
    for (const f of resultA.findings) {
      const cat = f.subcategory ? `${f.category} › ${f.subcategory}` : f.category;
      if (!byCategory[cat]) byCategory[cat] = { passed: 0, failed: 0 };
      if (f.passed) byCategory[cat].passed++;
      else byCategory[cat].failed++;
    }
    const findingRows = Object.entries(byCategory).map(([cat, v]) => [
      sanitize(cat.slice(0, 40)),
      String(v.passed),
      String(v.failed),
    ]);
    autoTable(doc, {
      startY: y,
      head: [["Category", "Passed", "Failed"]],
      body: findingRows,
      theme: "grid",
      styles: { fontSize: FONT_SIZE },
      headStyles: { fillColor: [34, 197, 94] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // Footer on first page (A4 height = 297 mm)
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    "IR AI Readiness Scanner — Compare domains for investor relations AI/agent retrieval signals. Methodology: scan results may be cached.",
    14,
    287,
    { maxWidth: pageWidth - 28 }
  );

  const filename = singleDomain
    ? `IR-Readiness-${domainAShort.replace(/[^a-z0-9.-]/gi, "-").slice(0, 30)}.pdf`
    : "IR-Readiness-Comparison.pdf";
  doc.save(filename);
}

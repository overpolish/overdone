/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

/**
 * Resized table columns are stored as each cell's `colwidth` (prosemirror-tables
 * keeps the width on the cell, not in the markup). A bare `<table>` ignores those
 * in a static render, so the read-only comment view would drop every column
 * width. This rebuilds the `<colgroup>` the editor draws at runtime: read the
 * first row's `colwidth`s, emit one `<col>` per column, and pin the table to
 * fixed layout so the widths take. Tables with no resized columns are left as-is
 * (auto layout). Returns the input unchanged when there are no tables. (The
 * read-only renderer wraps each table in a horizontal ScrollArea; see splitComment.)
 */
export function applyTableColumns(html: string): string {
  if (!html.includes("<table")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const table of doc.querySelectorAll("table")) {
    // A stored table already round-tripped through the editor won't have one, but
    // guard against double-applying (e.g. re-rendering already-processed HTML).
    if (table.querySelector("colgroup")) continue;
    const firstRow = table.querySelector("tr");
    if (!firstRow) continue;

    // Expand each cell across its colspan so the columns line up one-to-one.
    const widths: (number | null)[] = [];
    for (const cell of firstRow.querySelectorAll("th, td")) {
      const span = parseInt(cell.getAttribute("colspan") ?? "1", 10) || 1;
      const parts = (cell.getAttribute("colwidth") ?? "")
        .split(",")
        .map((n) => parseInt(n, 10));
      for (let i = 0; i < span; i++) widths.push(parts[i] || null);
    }
    if (!widths.some(Boolean)) continue;

    const colgroup = doc.createElement("colgroup");
    let total = 0;
    let allFixed = true;
    for (const w of widths) {
      const col = doc.createElement("col");
      if (w) {
        col.style.width = `${w}px`;
        total += w;
      } else {
        allFixed = false;
      }
      colgroup.appendChild(col);
    }
    table.insertBefore(colgroup, table.firstChild);
    table.style.tableLayout = "fixed";
    // Only pin the table's own width when every column is sized; a partial set
    // leaves it free to take its natural width for the unsized columns.
    if (allFixed) table.style.width = `${total}px`;
  }
  return doc.body.innerHTML;
}

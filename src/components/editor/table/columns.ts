/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type Node as PMNode } from "@tiptap/pm/model";
import { Plugin, type Transaction } from "@tiptap/pm/state";
import { type Editor } from "@tiptap/react";

// Column-width logic for the comment/scratchpad table. prosemirror-tables keeps
// each column's width on its cells' `colwidth`; these helpers read, compare, and
// rewrite those so the table can be evenly distributed (and stay even when its
// overall width is dragged).

/** The per-column widths of a table, read off its first row (the row that drives
 * the `<colgroup>`), expanded across any colspans so columns line up one-to-one.
 * A column the user never sized reads as `null`. */
function columnWidths(table: PMNode): (number | null)[] {
  const widths: (number | null)[] = [];
  const row = table.firstChild;
  row?.forEach((cell) => {
    const cw = cell.attrs.colwidth as number[] | null;
    const span = (cell.attrs.colspan as number) || 1;
    for (let i = 0; i < span; i += 1) widths.push(cw?.[i] ?? null);
  });
  return widths;
}

/** Whether every column carries the same explicit width (i.e. the table is in
 * the "evenly distributed" state). */
function columnsAreEven(widths: (number | null)[]): boolean {
  return widths.length > 0 && widths.every((w) => w != null && w === widths[0]);
}

/** Write `each` as the width of every cell's column in `table` (content starting
 * at `contentStart`), via `tr`. Shared by the distribute command and the
 * keep-even resize plugin. */
function fillColumns(tr: Transaction, table: PMNode, contentStart: number, each: number): void {
  table.descendants((node, pos) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      const span = (node.attrs.colspan as number) || 1;
      tr.setNodeMarkup(contentStart + pos, undefined, {
        ...node.attrs,
        colwidth: new Array<number>(span).fill(each),
      });
      return false; // no need to descend into the cell's content
    }
    return true;
  });
}

/**
 * Keep an evenly-distributed table even when its overall width changes. Dragging
 * the last column's edge resizes the whole table (prosemirror-tables only widens
 * that one column), which would otherwise break an even table. So on a commit
 * that left an even table changed in its last column alone, re-spread the new
 * total evenly. A drag on any inner column is left alone - that's a deliberate
 * per-column resize.
 */
export const keepEvenColumns = new Plugin({
  appendTransaction(transactions, oldState, newState) {
    if (!transactions.some((t) => t.docChanged)) return null;
    let tr: Transaction | null = null;
    newState.doc.descendants((node, pos) => {
      if (node.type.name !== "table") return undefined;
      const before = oldState.doc.nodeAt(pos);
      // Only a same-shape table whose widths actually changed is a resize.
      if (!before || before === node || before.type.name !== "table") return false;
      const oldW = columnWidths(before);
      const newW = columnWidths(node);
      if (oldW.length !== newW.length || !columnsAreEven(oldW)) return false;
      const last = newW.length - 1;
      const lastMoved = newW[last] !== oldW[last];
      const innerMoved = newW.some((w, i) => i !== last && w !== oldW[i]);
      if (!lastMoved || innerMoved) return false;
      const total = newW.reduce((sum: number, w) => sum + (w ?? 0), 0);
      const each = Math.max(24, Math.floor(total / newW.length));
      tr ??= newState.tr;
      fillColumns(tr, node, pos + 1, each);
      return false;
    });
    return tr;
  },
});

/**
 * Give every column in the table holding the selection an equal width: measure
 * the table's current rendered width and split it evenly across the columns,
 * writing that width onto each cell's `colwidth`. prosemirror-tables has no
 * command for this, so walk the table node and set the attribute directly. Used
 * by the distribute-columns button and by a freshly inserted table.
 */
export function distributeColumns(editor: Editor): void {
  const { state, view } = editor;
  const { $from } = state.selection;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type.name !== "table") depth -= 1;
  if (depth === 0) return;

  const table = $from.node(depth);
  const tableStart = $from.start(depth);

  // Column count from the widest row (counting colspans).
  let cols = 0;
  table.forEach((row) => {
    let n = 0;
    row.forEach((cell) => (n += (cell.attrs.colspan as number) || 1));
    cols = Math.max(cols, n);
  });
  if (cols === 0) return;

  // Split the table's available width (the wrapper spans the editor's content
  // width even when the table itself is narrower) evenly across the columns.
  const dom = view.nodeDOM($from.before(depth));
  const avail = dom instanceof HTMLElement ? dom.clientWidth : 0;
  const each = avail > 0 ? Math.max(24, Math.floor(avail / cols)) : 120;

  const { tr } = state;
  fillColumns(tr, table, tableStart, each);
  if (tr.docChanged) view.dispatch(tr);
  editor.commands.focus();
}

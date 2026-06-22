/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import {
  Table as TableBase,
  TableCell,
  TableHeader,
  TableRow,
  TableView,
} from "@tiptap/extension-table";
import { type Editor } from "@tiptap/react";

import { attachScrollShadows } from "../../../lib/scroll-shadow";
import { distributeColumns, keepEvenColumns } from "./columns";

export { TableControls } from "./TableControls";

/**
 * The resizable table's wrapper, with the app's scroll treatment attached: an
 * over-wide table scrolls inside it with an overlay scrollbar and fading edge
 * shadows. Safe because prosemirror-tables' TableView already ignores every
 * non-content mutation in the wrapper, so OverlayScrollbars restructuring it
 * doesn't disturb the editor. columnResizing instantiates this via the `View`
 * option (see the Table config), so resizing keeps working.
 */
class ScrollShadowTableView extends TableView {
  private detachScroll?: () => void;
  private raf: number;

  constructor(...args: ConstructorParameters<typeof TableView>) {
    super(...args);
    // Attach once the wrapper is in the document (prosemirror inserts `this.dom`
    // right after construction). OverlayScrollbars on a still-detached element
    // measures zero and never enables the scroll, so defer a frame.
    this.raf = requestAnimationFrame(() => {
      this.detachScroll = attachScrollShadows(this.dom, "horizontal");
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.detachScroll?.();
  }
}

/** The cell-highlight attribute, shared by body and header cells so a colour
 * survives toggling the header row. Serialised as `data-cell-bg` (the picker and
 * its CSS live in TableControls / theme.css). */
const cellBackgroundAttr = {
  default: null as string | null,
  parseHTML: (element: HTMLElement) => element.getAttribute("data-cell-bg"),
  renderHTML: (attributes: Record<string, unknown>) =>
    attributes.background ? { "data-cell-bg": attributes.background as string } : {},
};

/**
 * Table support for comments and the scratchpad. A fresh table's columns are
 * given equal widths (see insertDefaultTable); dragging a cell's right edge
 * resizes its column, and dragging the last column's edge resizes the table
 * (staying even if it was even, via keepEvenColumns). Widths ride along in the
 * stored HTML as each cell's `colwidth`, which the read-only view rebuilds into a
 * `<colgroup>` (see `applyTableColumns`). Body and header cells carry a preset
 * highlight colour. (Row-height resizing isn't offered - rows grow to fit their
 * content - and prosemirror-tables has no concept of it.)
 */
export const tableExtensions = [
  TableBase.extend({
    addProseMirrorPlugins() {
      return [...(this.parent?.() ?? []), keepEvenColumns];
    },
  }).configure({ resizable: true, View: ScrollShadowTableView }),
  TableRow,
  TableHeader.extend({
    addAttributes() {
      return { ...this.parent?.(), background: cellBackgroundAttr };
    },
  }),
  TableCell.extend({
    addAttributes() {
      return { ...this.parent?.(), background: cellBackgroundAttr };
    },
  }),
];

/** A 3x3 table with a header row, the shape the format-bar button inserts. Then
 * even out the columns so it starts filling the width (rather than collapsing to
 * its content), and so the table carries explicit widths to resize from. */
export function insertDefaultTable(editor: Editor): void {
  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  distributeColumns(editor);
}

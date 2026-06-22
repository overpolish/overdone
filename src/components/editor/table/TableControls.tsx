/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Paper, UnstyledButton } from "@mantine/core";
import {
  IconArrowAutofitWidth,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconHeading,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
  IconTrash,
} from "@tabler/icons-react";
import { type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";

import { IconButton } from "../../ui/IconButton";
import { distributeColumns } from "./columns";

/**
 * A cell's preset highlight, written to the cell as `data-cell-bg="<key>"`. The
 * tint and matching text colour come from CSS per key + scheme (see theme.css),
 * the same translucent-hue treatment the label badges use. The `h`/`s` here drive
 * the picker's swatch and must stay in step with that CSS.
 */
interface CellColor {
  key: string;
  label: string;
  h: number;
  s: number;
}
const CELL_COLORS: CellColor[] = [
  { key: "red", label: "Red", h: 0, s: 75 },
  { key: "amber", label: "Amber", h: 38, s: 92 },
  { key: "green", label: "Green", h: 140, s: 55 },
  { key: "blue", label: "Blue", h: 210, s: 80 },
  { key: "purple", label: "Purple", h: 265, s: 70 },
];

/** The cell-highlight swatch lane: a default (outlined, no fill) plus the preset
 * colours, always visible. Applies to every cell in the current selection (a
 * single cell, or a dragged row / column / range). */
function ColorLane({ editor }: { editor: Editor }) {
  const swatches: { key: string | null; label: string; fill: string | null }[] = [
    { key: null, label: "Default", fill: null },
    ...CELL_COLORS.map((c) => ({ key: c.key, label: c.label, fill: `hsl(${c.h}, ${c.s}%, 50%)` })),
  ];

  return (
    <span style={{ display: "flex", gap: 5, alignItems: "center", justifyContent: "center" }}>
      {swatches.map((s) => (
        <UnstyledButton
          key={s.key ?? "none"}
          aria-label={s.label}
          title={s.label}
          // Keep the cell selection while picking (focus would collapse it, and
          // we don't want a lingering focus ring read as the applied colour).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            editor.chain().focus().setCellAttribute("background", s.key).run();
          }}
          style={{
            width: 16,
            height: 16,
            borderRadius: "var(--mantine-radius-sm)",
            background: s.fill ?? "transparent",
            // The default reads as an empty square: outline only, no fill.
            border: s.fill ? "none" : "1px solid var(--mantine-color-default-border)",
          }}
        />
      ))}
    </span>
  );
}

/**
 * A small toolbar that floats over the table the caret sits in (the same pattern
 * as {@link LinkBubble}), since a comment table has no room for inline controls.
 * The top lane handles structure (rows, columns, the header toggle, even-out and
 * delete); the bottom lane is the always-visible cell-colour swatches.
 */
export function TableControls({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      // Distinct key so this coexists with the link bubble on the same editor.
      pluginKey="tableControls"
      // Append to <body> (not the editor's parent) so the clipping comment-log
      // ScrollArea can't hide it; Floating UI still anchors it to the selection.
      appendTo={() => document.body}
      // Float above the composer's later-painted controls (e.g. the Save button).
      style={{ zIndex: "var(--mantine-z-index-max)" }}
      // Up whenever the selection is inside a table, regardless of focus.
      shouldShow={({ editor }) => editor.isActive("table")}
      options={{ placement: "top", offset: 6, flip: true, shift: true }}
    >
      <Paper withBorder shadow="md" radius="md" p={3}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <IconButton
              label="Insert row above"
              icon={IconRowInsertTop}
              radius="sm"
              onClick={() => editor.chain().focus().addRowBefore().run()}
            />
            <IconButton
              label="Insert row below"
              icon={IconRowInsertBottom}
              radius="sm"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            />
            <IconButton
              label="Delete row"
              icon={IconRowRemove}
              radius="sm"
              onClick={() => editor.chain().focus().deleteRow().run()}
            />
            <IconButton
              label="Insert column left"
              icon={IconColumnInsertLeft}
              radius="sm"
              onClick={() => editor.chain().focus().addColumnBefore().run()}
            />
            <IconButton
              label="Insert column right"
              icon={IconColumnInsertRight}
              radius="sm"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            />
            <IconButton
              label="Delete column"
              icon={IconColumnRemove}
              radius="sm"
              onClick={() => editor.chain().focus().deleteColumn().run()}
            />
            <IconButton
              label="Distribute columns evenly"
              icon={IconArrowAutofitWidth}
              radius="sm"
              onClick={() => distributeColumns(editor)}
            />
            <IconButton
              label="Toggle header row"
              icon={IconHeading}
              radius="sm"
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
            />
            <IconButton
              label="Delete table"
              icon={IconTrash}
              danger
              radius="sm"
              onClick={() => editor.chain().focus().deleteTable().run()}
            />
          </span>
          <ColorLane editor={editor} />
        </div>
      </Paper>
    </BubbleMenu>
  );
}

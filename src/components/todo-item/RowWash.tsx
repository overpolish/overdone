/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box } from "@mantine/core";
import { type CSSProperties } from "react";

const RADIUS = "var(--mantine-radius-sm)";
const HOVER = "var(--mantine-color-default-hover)";
const BORDER = "var(--mantine-color-default-border)";

/**
 * Shared positioning for a row backing: full-height, bleeding only horizontally
 * (rows are flush, so a vertical bleed would overlap the neighbour's wash and
 * double into a dark seam), behind the content and non-interactive.
 */
const base: CSSProperties = {
  position: "absolute",
  inset: 0,
  marginInline: -8,
  pointerEvents: "none",
  zIndex: -1,
};

/** The selection wash style: same fill + border as the editing highlight, but a
 * run of adjacent selected rows merges into one region - the shared edge is
 * dropped and only the run's outer corners round (an isolated row is identical
 * to the editing highlight). */
function selectionStyle(selPrev: boolean, selNext: boolean): CSSProperties {
  return {
    borderTopLeftRadius: selPrev ? 0 : RADIUS,
    borderTopRightRadius: selPrev ? 0 : RADIUS,
    borderBottomLeftRadius: selNext ? 0 : RADIUS,
    borderBottomRightRadius: selNext ? 0 : RADIUS,
    background: HOVER,
    // Per-edge inset border: left + right always; top/bottom only where the run
    // ends, so neighbours within a run share a seamless fill.
    boxShadow: [
      `inset 1px 0 0 0 ${BORDER}`,
      `inset -1px 0 0 0 ${BORDER}`,
      !selPrev && `inset 0 1px 0 0 ${BORDER}`,
      !selNext && `inset 0 -1px 0 0 ${BORDER}`,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

interface RowWashProps {
  /** Status tint (overdue/notification/due-today), or null for none. */
  statusColor: string | null;
  selected: boolean;
  /** Whether the visible rows above/below are also selected (contiguous merge). */
  selPrev: boolean;
  selNext: boolean;
  /** The row's editing panel (details/assignees/status) is open. */
  editing: boolean;
}

/**
 * The stacked backings behind a todo row, in priority order: the status tint, the
 * multi-select wash, and the editing-panel highlight. All sit behind the content
 * (zIndex -1) and bleed horizontally to read as a single continuous band.
 */
export function RowWash({ statusColor, selected, selPrev, selNext, editing }: RowWashProps) {
  return (
    <>
      {statusColor && (
        <Box
          aria-hidden
          style={{
            ...base,
            borderRadius: RADIUS,
            background: `color-mix(in srgb, ${statusColor} 14%, transparent)`,
          }}
        />
      )}
      {selected && <Box aria-hidden style={{ ...base, ...selectionStyle(selPrev, selNext) }} />}
      {editing && (
        <Box
          aria-hidden
          style={{ ...base, borderRadius: RADIUS, background: HOVER, boxShadow: `inset 0 0 0 1px ${BORDER}` }}
        />
      )}
    </>
  );
}

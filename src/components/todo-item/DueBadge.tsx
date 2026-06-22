/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { IconCalendar } from "@tabler/icons-react";
import dayjs from "dayjs";

import { type DueState, STATUS_COLOR } from "./itemStatus";

/**
 * Inline due-date chip for the row's badge line (alongside labels): a small
 * calendar glyph with the date to its right. Tinted red when overdue and orange
 * when due today; a future date reads in the dimmed default. The year is shown
 * only when it isn't the current one, to stay compact for the common case.
 */
export function DueBadge({ dueDate, dueState }: { dueDate: number; dueState: DueState }) {
  const color = dueState ? STATUS_COLOR[dueState] : "var(--mantine-color-dimmed)";
  const d = dayjs(dueDate);
  const text = d.isSame(dayjs(), "year") ? d.format("MMM D") : d.format("MMM D, YYYY");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        color,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      <IconCalendar size={13} stroke={1.8} />
      {text}
    </span>
  );
}

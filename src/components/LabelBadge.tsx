/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { useComputedColorScheme } from "@mantine/core";

import { labelColors } from "../lib/label";
import { type Label } from "../lib/todos";

/**
 * A GitHub-style label badge: a small, translucent pill with a colored border
 * and matching colored text. The tint/text/border are derived from the label's
 * color family (see {@link labelColors}) so it reads well in both schemes.
 * `size` (the badge height in px) drives padding and font so the same badge
 * works inline above a row's title and at a roomier size in the details picker.
 */
export function LabelBadge({ label, size = 16 }: { label: Label; size?: number }) {
  const dark = useComputedColorScheme("light") === "dark";
  const { bg, fg, border } = labelColors(label.color, dark);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: size,
        paddingInline: Math.round(size * 0.42),
        borderRadius: "var(--mantine-radius-xl)",
        background: bg,
        border: `1px solid ${border}`,
        color: fg,
        fontSize: Math.round(size * 0.62),
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
        userSelect: "none",
        verticalAlign: "middle",
      }}
    >
      {label.name}
    </span>
  );
}

/** A wrapping row of read-only label badges (e.g. above a row's title). Renders
 * nothing when there are no labels, so callers needn't guard. */
export function LabelBadges({ labels, size = 15 }: { labels: Label[]; size?: number }) {
  if (labels.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {labels.map((l) => (
        <LabelBadge key={l.id} label={l} size={size} />
      ))}
    </div>
  );
}

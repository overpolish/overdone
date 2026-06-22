/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { useLayoutEffect, useRef } from "react";

import { todoStateMeta, type TodoState } from "../../lib/todo";

export const BOX_SIZE = 16;

interface StateBoxProps {
  state: TodoState;
  size?: number;
  /** Apply the per-glyph optical nudge (only wanted at the small dropdown size). */
  optical?: boolean;
}

/**
 * The square status indicator. `todo` mirrors the plain Mantine checkbox
 * surface (`default` bg + border); the other states paint a filled color box
 * with a white glyph, matching the "normal check" / clock the picker offers.
 */
export function StateBox({ state, size = BOX_SIZE, optical = false }: StateBoxProps) {
  const { color, icon: Icon, iconNudgeY } = todoStateMeta(state);
  const filled = color != null;
  // The box follows variable-width content (chip labels, the wrapping status row)
  // so its left edge lands at a different fractional device-pixel offset on every
  // instance. The icon is exactly centered in the box, but when the box straddles
  // a physical pixel the thin glyph strokes (e.g. the in-progress circle) smear
  // asymmetrically and read as shoved left/right - WKWebView doesn't snap
  // composited layers, so translateZ can't fix it. Measure the sub-pixel
  // remainder and nudge the box onto the device grid so the glyph stays crisp.
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.transform = "none";
    const { left } = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const snapped = Math.round(left * dpr) / dpr;
    el.style.transform = `translateX(${snapped - left}px)`;
  });
  // Snap to an even integer (~0.7 of the box) so the glyph sits on whole pixels
  // and stays centered - a fractional size leaves it visibly off (e.g. the
  // clock's round face) at the 16px dropdown size.
  const iconSize = Math.round((size * 0.7) / 2) * 2;
  // Optical correction, scaled to the box. Only for the small dropdown swatches
  // - at the larger main-checkbox size the glyph already reads centered.
  const nudgeY = optical && iconNudgeY ? size * iconNudgeY : 0;

  return (
    <div
      ref={boxRef}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--mantine-radius-sm)",
        background: filled
          ? `var(--mantine-color-${color}-6)`
          : "var(--mantine-color-default)",
        border: filled
          ? "1px solid transparent"
          : "1px solid var(--mantine-color-default-border)",
        color: "var(--mantine-color-white)",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      {/* `display: block` drops the inline-SVG baseline gap; `nudgeY` applies
          the per-glyph optical correction. */}
      {Icon && (
        <Icon
          size={iconSize}
          stroke={3}
          style={{
            display: "block",
            transform: nudgeY ? `translateY(${nudgeY}px)` : undefined,
          }}
        />
      )}
    </div>
  );
}

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { UnstyledButton, useComputedColorScheme } from "@mantine/core";
import { type IconProps } from "@tabler/icons-react";
import { type ComponentType, useLayoutEffect, useRef, useState } from "react";

import { dangerBg, dangerFg, warningBg, warningFg } from "../lib/styles";

interface IconButtonProps {
  label: string;
  icon: ComponentType<IconProps>;
  onClick: () => void;
  /** Tints red on hover (destructive actions like close / delete). */
  danger?: boolean;
  /** Toggle controls (e.g. format bar): renders an "on" surface when set. */
  active?: boolean;
  /** Tints amber and stays lit to flag an altered state (e.g. filter active). */
  warning?: boolean;
}

/**
 * A small square icon button: dimmed and chrome-free at rest, gaining a hover
 * surface (red for destructive actions) only on pointer-over. Shared by the
 * title bar's window controls, the comment log's edit/delete actions, and the
 * comment editor's format toggles (via `active`).
 */
export function IconButton({ label, icon: Icon, onClick, danger, active, warning }: IconButtonProps) {
  const [hovered, setHovered] = useState(false);
  const dark = useComputedColorScheme("light") === "dark";
  const ref = useRef<HTMLButtonElement>(null);

  // When the button's box straddles a physical pixel, WKWebView smears the thin
  // icon strokes asymmetrically so the glyph reads off-center (and appears to
  // jump on hover when the background reveals it). Nudge the button onto the
  // device grid so the strokes stay crisp. (Same fix as the assignee chips.)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "none";
    const { left, top } = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const snap = (v: number) => Math.round(v * dpr) / dpr - v;
    el.style.transform = `translate(${snap(left)}px, ${snap(top)}px)`;
  });

  const strong = active || hovered || warning;
  return (
    <UnstyledButton
      ref={ref}
      aria-label={label}
      // Preserve the editor's selection/focus when used as a format toggle:
      // taking button focus on mousedown would collapse the selection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        // Re-enable events for the button; some hosts (the title bar) sit in a
        // drag region that disables them.
        pointerEvents: "auto",
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--mantine-radius-md)",
        opacity: strong ? 1 : 0.5,
        color:
          danger && hovered
            ? dangerFg(dark)
            : warning
              ? warningFg(dark)
              : active
                ? "var(--mantine-color-text)"
                : "var(--mantine-color-dimmed)",
        background:
          danger && hovered
            ? dangerBg(dark)
            : warning && hovered
              ? warningBg(dark)
              : hovered || active
                ? "var(--mantine-color-default-hover)"
                : "transparent",
        transition: "opacity 120ms ease, background 120ms ease, color 120ms ease",
      }}
    >
      <Icon size={14} stroke={2} style={{ display: "block" }} />
    </UnstyledButton>
  );
}

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { hexToHsl, randomColor } from "./assignee";
import { type Label } from "./todos";

/**
 * Label colors. A label stores a `#rrggbb` hex (the same generator assignees
 * use), and the badge is rendered GitHub-style by tinting that hue: a translucent
 * background, a brighter/darker readable text shade, and a faint matching border,
 * computed per color scheme so it reads in both light and dark mode. Drawing
 * from the full hue wheel keeps a large roster varied and collision-free.
 */

/** A random label color: a vivid hex from the full hue wheel. Labels are born
 * random (GitHub-style); reshuffle from Settings until you like it. */
export function randomLabelColor(): string {
  return randomColor();
}

/** Normalize a legacy stored color to a Mantine family name. Pre-hex labels
 * stored either a family ("teal") or a full `var(--mantine-color-teal-6)`. */
function labelFamily(color: string): string {
  const m = color.match(/--mantine-color-([a-z]+)-\d/);
  return m ? m[1] : color;
}

/**
 * Resolve a label color into the translucent badge palette (background, text,
 * border) for the current scheme. Hex colors are tinted from their hue; legacy
 * family/var colors fall back to Mantine's theme-aware `light` variant tokens.
 */
export function labelColors(
  color: string,
  dark: boolean,
): { bg: string; fg: string; border: string } {
  const hsl = hexToHsl(color);
  if (!hsl) {
    const family = labelFamily(color);
    const fg = `var(--mantine-color-${family}-light-color)`;
    return {
      bg: `var(--mantine-color-${family}-light)`,
      fg,
      border: `color-mix(in srgb, ${fg} 40%, transparent)`,
    };
  }
  const { h, s } = hsl;
  // Drive everything off the hue/saturation; the alpha-tinted background sits on
  // the scheme's surface, and the text lightens (dark mode) or darkens (light
  // mode) into a readable, saturated shade. Border is the text shade at low alpha.
  return dark
    ? {
        bg: `hsla(${h}, ${s}%, 55%, 0.2)`,
        fg: `hsl(${h}, ${s}%, 78%)`,
        border: `hsla(${h}, ${s}%, 68%, 0.38)`,
      }
    : {
        bg: `hsla(${h}, ${s}%, 45%, 0.13)`,
        fg: `hsl(${h}, ${s}%, 32%)`,
        border: `hsla(${h}, ${s}%, 42%, 0.32)`,
      };
}

/** Resolve label ids against a roster (dropping any that no longer exist),
 * sorted alphabetically by name for stable, predictable display (like assignees). */
export function resolveLabels(ids: string[], roster: Label[]): Label[] {
  return ids
    .map((id) => roster.find((l) => l.id === id))
    .filter((l): l is Label => l != null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

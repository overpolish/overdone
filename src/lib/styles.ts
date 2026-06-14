/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

/**
 * Scheme-aware "danger" (destructive) hover styling, shared by the title bar's
 * close button and the dropdown's delete row.
 *
 * Mantine's `--mantine-color-red-light` reads well in light mode but turns
 * muddy/too-dark over dark surfaces, so in dark mode we use a brighter
 * translucent red that sits as a soft tint over whatever is behind it, with a
 * lighter red foreground for contrast.
 */

/** Hover background for a destructive control. */
export const dangerBg = (dark: boolean): string =>
  dark ? "rgba(248, 113, 113, 0.22)" : "var(--mantine-color-red-light)";

/** Foreground (icon/text) color for a destructive control. */
export const dangerFg = (dark: boolean): string =>
  dark ? "var(--mantine-color-red-4)" : "var(--mantine-color-red-6)";

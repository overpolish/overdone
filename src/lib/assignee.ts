/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type Assignee } from "./todos";

/**
 * Helpers for assignee avatars: name → initials, plus avatar colors. A color is
 * stored as a full Mantine color CSS var (e.g. `var(--mantine-color-blue-6)`) so
 * the avatar can render it directly. Colors come from a preset palette of
 * vibrant Tailwind families (grays excluded), with a slight random shade offset
 * around the base for extra variation between people.
 */
export const ASSIGNEE_COLORS = [
  "red",
  "orange",
  "amber",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "pink",
  "rose",
] as const;

/** Mid shade the chips center on; the random offset varies ±1 around it. */
const BASE_SHADE = 6;
const SHADES = [BASE_SHADE - 1, BASE_SHADE, BASE_SHADE + 1];

function shadeColor(family: string, shade: number): string {
  return `var(--mantine-color-${family}-${shade})`;
}

/**
 * Confluence-style initials: a single name yields its first letter ("Dom" → D),
 * a multi-word name the first letters of its first and last words ("John Doe" →
 * JD). Always uppercased, at most two characters.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Deterministic default color for a name, so new people get a stable family. */
export function pickColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return shadeColor(ASSIGNEE_COLORS[hash % ASSIGNEE_COLORS.length], BASE_SHADE);
}

/** A fresh random color: a random preset family at a slightly random shade. */
export function randomColor(): string {
  const family = ASSIGNEE_COLORS[Math.floor(Math.random() * ASSIGNEE_COLORS.length)];
  const shade = SHADES[Math.floor(Math.random() * SHADES.length)];
  return shadeColor(family, shade);
}

/** Resolve assignee ids against a roster (dropping any that no longer exist),
 * sorted alphabetically by name for stable, predictable display. */
export function resolveAssignees(ids: string[], roster: Assignee[]): Assignee[] {
  return ids
    .map((id) => roster.find((a) => a.id === id))
    .filter((a): a is Assignee => a != null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

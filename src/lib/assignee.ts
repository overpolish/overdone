/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type Assignee } from "./todos";

/**
 * Helpers for assignee avatars: name → initials, plus avatar colors. A color is
 * stored as a `#rrggbb` hex string; the avatar renders it as a solid background
 * and picks black/white text for contrast (see {@link readableText}). Colors are
 * drawn from the whole hue wheel with vivid, mid-dark saturation/lightness, so a
 * roster of any size stays varied and rarely collides - far better than a small
 * fixed palette. Labels share this generator (see lib/label.ts), tinting the
 * same hex into translucent badges.
 */

/** Convert HSL (h 0–360, s/l 0–100) to a `#rrggbb` hex string. */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Parse a `#rrggbb` string to RGB (0–255), or null if it isn't a hex color
 * (e.g. a legacy `var(--mantine-color-…)` value). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** Parse a `#rrggbb` string to HSL (h 0–360, s/l 0–100), or null if not hex. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** A vivid, mid-dark color for a hue - the family look every generated color
 * shares, so avatars stay legible with white text and labels tint cleanly. */
function vivid(hue: number): string {
  return hslToHex(hue, 68, 48);
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

/** Deterministic default color for a name, so new people get a stable hue (1 of
 * 360, vs. the old 15 families - far fewer collisions). */
export function pickColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return vivid(hash % 360);
}

/** A fresh random color: a random hue with slight saturation/lightness jitter,
 * so even two picks of a near hue still differ. */
export function randomColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 60 + Math.floor(Math.random() * 18); // 60–77
  const l = 44 + Math.floor(Math.random() * 10); // 44–53
  return hslToHex(h, s, l);
}

/** Black or white text for a colored background, by perceived luminance. Falls
 * back to white for non-hex (legacy Mantine-var) colors, preserving prior look. */
export function readableText(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return "#fff";
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#fff";
}

/** Resolve assignee ids against a roster (dropping any that no longer exist),
 * sorted alphabetically by name for stable, predictable display. */
export function resolveAssignees(ids: string[], roster: Assignee[]): Assignee[] {
  return ids
    .map((id) => roster.find((a) => a.id === id))
    .filter((a): a is Assignee => a != null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

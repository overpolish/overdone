/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { openUrl } from "@tauri-apps/plugin-opener";

import { type Comment } from "./todos";

/** A hyperlink surfaced from a comment - the derived (Tier 2) counterpart to a
 * saved {@link LinkItem}, carrying just enough to display and pin it. */
export interface ScannedLink {
  url: string;
  /** The anchor's visible text, when it differs from the bare URL. */
  title?: string;
}

/**
 * Coerce free-form input into an absolute URL, defaulting a missing scheme to
 * https. Returns null when it can't be parsed as a URL at all (e.g. blank, or
 * stray text), so callers can reject it without throwing.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(withScheme).href;
  } catch {
    return null;
  }
}

/**
 * Pull the hyperlinks out of an item's comment log, newest comment first and
 * deduped by URL. These are the `<a href>` anchors the editor's link mark (and
 * autolink) produce; only http(s) links are surfaced. The first anchor seen for
 * a URL wins its title, so the most recent mention's label is the one shown.
 */
export function scanCommentLinks(comments: Comment[]): ScannedLink[] {
  const found = new Map<string, ScannedLink>();
  // Newest first so the freshest mention's anchor text wins the title.
  for (const comment of [...comments].reverse()) {
    const doc = new DOMParser().parseFromString(comment.text, "text/html");
    doc.querySelectorAll("a[href]").forEach((a) => {
      const url = a.getAttribute("href")?.trim();
      if (!url || !/^https?:\/\//i.test(url) || found.has(url)) return;
      const text = (a.textContent ?? "").trim();
      found.set(url, { url, title: text && text !== url ? text : undefined });
    });
  }
  return [...found.values()];
}

/** Display label for a link: its custom title, else a tidied host + path
 * (drops the scheme, a leading `www.`, and a bare trailing slash). */
export function linkLabel(link: { url: string; title?: string }): string {
  if (link.title) return link.title;
  try {
    const u = new URL(link.url);
    const host = u.host.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${host}${path}${u.search}`;
  } catch {
    return link.url;
  }
}

/** Open a link in the user's default browser (never inside the app window). */
export async function openExternal(url: string): Promise<void> {
  await openUrl(url);
}

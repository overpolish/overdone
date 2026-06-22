/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { referencedMedia, toStoredHtml } from "./media";

/** Embedded media (image / video / diagram) in serialized editor HTML. */
const MEDIA_HTML_RE = /<(?:img|video)\b|data-mermaid/i;

/**
 * Drop the first `n` characters of text from serialized selection HTML while
 * keeping element nodes (images/videos), so the first line can become the item
 * and everything else - including media that sat on that first line - falls to
 * the comment. Leading blocks left blank by the cut are removed (unless they
 * still hold media), so the comment doesn't open with an empty line.
 */
export function stripFirstLine(html: string, n: number): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  let remaining = n;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (remaining > 0) {
    const node = walker.nextNode() as Text | null;
    if (!node) break;
    if (node.data.length <= remaining) {
      remaining -= node.data.length;
      node.data = "";
    } else {
      node.data = node.data.slice(remaining);
      remaining = 0;
    }
  }

  let first = root.firstElementChild;
  while (
    first &&
    (first.textContent ?? "").trim() === "" &&
    !first.querySelector("img, video, [data-mermaid]")
  ) {
    first.remove();
    first = root.firstElementChild;
  }
  return root.innerHTML;
}

/** A note selection turned into a list item: the first line is the item text;
 * anything past it (extra lines and embedded media) becomes its first comment. */
export interface ConvertedItem {
  /** The item's text (the selection's first line). */
  text: string;
  /** Stored HTML for the item's first comment, if the selection had more than a
   * single line of plain text. */
  comment?: string;
  /** Attachment filenames referenced by `comment`. */
  mediaFiles: string[];
}

/**
 * Split a selection into the item it becomes. `selectionText` is the plain text
 * (paragraph / hard breaks as `\n`); `selectionHtml` is its serialized display
 * HTML. Returns null when the first line is blank (nothing to make).
 */
export function buildConvertedItem(
  selectionText: string,
  selectionHtml: string,
): ConvertedItem | null {
  const nl = selectionText.indexOf("\n");
  const firstRaw = nl === -1 ? selectionText : selectionText.slice(0, nl);
  const text = firstRaw.trim();
  if (!text) return null;

  const hasMedia = MEDIA_HTML_RE.test(selectionHtml);
  const hasMoreText = (nl === -1 ? "" : selectionText.slice(nl + 1)).trim().length > 0;
  // Just a single plain line: the item alone, no comment.
  if (!hasMedia && !hasMoreText) return { text, mediaFiles: [] };

  const comment = toStoredHtml(stripFirstLine(selectionHtml, firstRaw.length));
  return { text, comment, mediaFiles: referencedMedia([comment]) };
}

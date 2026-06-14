/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

/**
 * Caret line-boundary detection for a textarea that accounts for *soft-wrapped*
 * lines, not just explicit newlines. Arrow-key navigation between items uses
 * this so it only leaves an item once the caret is truly on the item's first or
 * last visual row - a long item that wraps over several rows is walked through
 * line by line first.
 *
 * The browser exposes no caret geometry for a textarea, so we mirror its text
 * into an off-screen div that wraps identically and read the vertical offset of
 * the caret there, comparing it against the offsets of the text's start and end.
 */

/** CSS properties that affect wrapping/metrics, so the mirror must match them. */
const COPIED_PROPS = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "wordSpacing",
  "tabSize",
] as const;

// A single reused mirror node so we don't thrash the DOM on every keypress.
let mirror: HTMLDivElement | null = null;

/** Vertical offset (px) of the caret if it were placed at `index` in `el`. */
function caretTop(el: HTMLTextAreaElement, index: number): number {
  if (!mirror) {
    mirror = document.createElement("div");
    document.body.appendChild(mirror);
  }
  const cs = getComputedStyle(el);
  const style = mirror.style;
  for (const prop of COPIED_PROPS) {
    style[prop] = cs[prop];
  }
  style.position = "absolute";
  style.visibility = "hidden";
  style.left = "-9999px";
  style.top = "0";
  style.height = "auto";
  style.overflow = "hidden";
  // Match a textarea's wrapping: honour newlines/spaces and break long words.
  style.whiteSpace = "pre-wrap";
  style.overflowWrap = "break-word";

  // Text before the caret, then a marker carrying the remaining text. The
  // marker's top is the top of the visual row the caret sits on. ("." keeps the
  // marker laid out when the caret is at the very end.)
  mirror.textContent = el.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(index) || ".";
  mirror.appendChild(marker);
  return marker.offsetTop;
}

export interface CaretEdges {
  /** The caret (selection start) is on the textarea's first visual row. */
  atFirstLine: boolean;
  /** The caret (selection end) is on the textarea's last visual row. */
  atLastLine: boolean;
}

/** Whether the caret currently sits on the first and/or last visual row. */
export function caretEdges(el: HTMLTextAreaElement): CaretEdges {
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 0;
  // Within half a line of the boundary row counts as on it.
  const slack = lineHeight / 2 || 1;
  return {
    atFirstLine: caretTop(el, el.selectionStart) - caretTop(el, 0) < slack,
    atLastLine: caretTop(el, el.value.length) - caretTop(el, el.selectionEnd) < slack,
  };
}

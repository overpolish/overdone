/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { OverlayScrollbars } from "overlayscrollbars";

const SHADOW_SIZE = 16;

/**
 * Give an overflowing element the app's scroll treatment imperatively, for DOM
 * that React doesn't own - a ProseMirror table wrapper, or a table inside the
 * read-only comment HTML. It's the vanilla twin of the {@link ScrollArea}
 * component: OverlayScrollbars' slim, cross-platform overlay scrollbar (so the
 * bar looks the same on macOS and Windows) plus the fading edge shadows that
 * strengthen with how far there is left to scroll. Returns a teardown that
 * destroys the instance (and with it the shadows it added).
 */
export function attachScrollShadows(
  host: HTMLElement,
  orientation: "horizontal" | "vertical" = "horizontal",
): () => void {
  const horizontal = orientation === "horizontal";
  // The shadows are positioned against the host; it must establish a containing
  // block. (OverlayScrollbars scrolls an inner viewport, so the host stays put.)
  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  const osInstance = OverlayScrollbars(host, {
    overflow: horizontal ? { x: "scroll", y: "hidden" } : { x: "hidden", y: "scroll" },
    scrollbars: { theme: "os-theme-overdone", autoHide: "leave", autoHideDelay: 500 },
  });

  // Append the shadows *after* init so OverlayScrollbars doesn't pull them into
  // its scrolling viewport - they sit over the (static) host instead.
  const makeShadow = (side: "left" | "right" | "top" | "bottom") => {
    const dir = { top: "to bottom", bottom: "to top", left: "to right", right: "to left" }[side];
    const el = document.createElement("div");
    const span =
      side === "left" || side === "right"
        ? `top:0;bottom:0;width:${SHADOW_SIZE}px;${side}:0`
        : `left:0;right:0;height:${SHADOW_SIZE}px;${side}:0`;
    el.style.cssText = `position:absolute;pointer-events:none;z-index:1;opacity:0;background:linear-gradient(${dir}, var(--code-scroll-shadow), transparent);${span}`;
    host.appendChild(el);
    return el;
  };
  const startEl = makeShadow(horizontal ? "left" : "top");
  const endEl = makeShadow(horizontal ? "right" : "bottom");

  // Strength tracks scroll position across the whole range: the start shadow
  // grows as you scroll toward the end, the end shadow the reverse (matches
  // ScrollArea). Driven by scroll + the instance's own resize/content updates.
  const update = () => {
    const vp = osInstance.elements().viewport;
    const max = horizontal ? vp.scrollWidth - vp.clientWidth : vp.scrollHeight - vp.clientHeight;
    if (max <= 0) {
      startEl.style.opacity = "0";
      endEl.style.opacity = "0";
      return;
    }
    const frac = (horizontal ? vp.scrollLeft : vp.scrollTop) / max;
    startEl.style.opacity = String(frac);
    endEl.style.opacity = String(1 - frac);
  };
  osInstance.on("scroll", update);
  osInstance.on("updated", update);
  update();

  return () => osInstance.destroy();
}

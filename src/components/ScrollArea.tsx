/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { useComputedColorScheme } from "@mantine/core";
import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentRef,
} from "overlayscrollbars-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";

const SHADOW_HEIGHT = 16;

interface ScrollAreaProps {
  children: ReactNode;
  /** Cap the scroll height (e.g. the lists panel). Omit to fill the parent. */
  maxHeight?: number | string;
  /**
   * Corner radius for the container. It's rounded *and* clipped, so the scroll
   * shadows follow the same curve at the corners. Defaults to the standard `md`
   * radius; pass `0` to opt out (e.g. a full-bleed, window-filling scroll).
   */
  radius?: number | string;
  /** Hide the scrollbar (the fade shadows still cue that there's more). */
  hideScrollbar?: boolean;
  /** Applied to the outer (positioned) container. */
  style?: CSSProperties;
}

/**
 * A vertical scroll container with soft top/bottom shadows that fade in only
 * when there's more content to scroll to in that direction - a cue that the
 * list continues past the edge. The container is rounded and clips its content,
 * so the shadows round with it instead of squaring off at the corners.
 *
 * Scrolling is handled by OverlayScrollbars rather than the platform: we render
 * our own slim, floating scrollbar (see `.os-theme-overdone`) so the look is
 * identical on macOS and Windows instead of inheriting each OS's native bar.
 */
export function ScrollArea({
  children,
  maxHeight,
  radius = "var(--mantine-radius-md)",
  hideScrollbar,
  style,
}: ScrollAreaProps) {
  const osRef = useRef<OverlayScrollbarsComponentRef>(null);
  // 0..1 strength of each shadow, scaled by how far there is to scroll.
  const [top, setTop] = useState(0);
  const [bottom, setBottom] = useState(0);
  const dark = useComputedColorScheme("light") === "dark";

  // Recompute shadow strengths from the OverlayScrollbars viewport (its internal
  // scroll element, not the host). Driven by the instance's `scroll` and
  // `updated` events, the latter covering viewport resize and content changes.
  const update = useCallback(() => {
    const el = osRef.current?.osInstance()?.elements().viewport;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) {
      setTop(0);
      setBottom(0);
      return;
    }
    // Strength tracks scroll position across the whole range: the top shadow
    // grows from 0 (at the top) to full (at the bottom), the bottom shadow the
    // reverse.
    const frac = el.scrollTop / maxScroll;
    setTop(frac);
    setBottom(1 - frac);
  }, []);

  const alpha = dark ? 0.4 : 0.14;

  return (
    <div
      style={{
        position: "relative",
        minHeight: 0,
        borderRadius: radius,
        // Clip content (and the shadows) to the rounded corners so the shadows
        // curve with the container rather than squaring off.
        overflow: radius ? "hidden" : undefined,
        ...style,
      }}
    >
      <OverlayScrollbarsComponent
        ref={osRef}
        defer
        options={{
          overflow: { x: "hidden", y: "scroll" },
          scrollbars: {
            theme: "os-theme-overdone",
            // Show while the pointer is over the area, then fade; matches the
            // unobtrusive feel of a native overlay scrollbar.
            autoHide: "leave",
            autoHideDelay: 500,
            visibility: hideScrollbar ? "hidden" : "visible",
          },
        }}
        events={{ scroll: update, updated: update }}
        style={{ maxHeight: maxHeight ?? "100%" }}
      >
        {children}
      </OverlayScrollbarsComponent>
      <Shadow side="top" strength={top} alpha={alpha} />
      <Shadow side="bottom" strength={bottom} alpha={alpha} />
    </div>
  );
}

function Shadow({
  side,
  strength,
  alpha,
}: {
  side: "top" | "bottom";
  /** 0..1, driven by remaining scroll distance at this edge. */
  strength: number;
  alpha: number;
}) {
  const dir = side === "top" ? "to bottom" : "to top";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        ...(side === "top" ? { top: 0 } : { bottom: 0 }),
        height: SHADOW_HEIGHT,
        pointerEvents: "none",
        background: `linear-gradient(${dir}, rgba(0,0,0,${alpha}), rgba(0,0,0,0))`,
        opacity: strength,
        // Sit above the OverlayScrollbars viewport so the fade isn't scrolled away.
        zIndex: 1,
      }}
    />
  );
}

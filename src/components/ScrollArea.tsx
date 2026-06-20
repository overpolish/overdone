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

const SHADOW_SIZE = 16;

type Orientation = "vertical" | "horizontal";

interface ScrollAreaProps {
  children: ReactNode;
  /** Scroll axis. Vertical (default) shows top/bottom shadows; horizontal shows
   * left/right shadows. */
  orientation?: Orientation;
  /** Cap the scroll height (e.g. the lists panel). Omit to fill the parent.
   * Ignored for horizontal scrolling. */
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
 * A scroll container with soft shadows that fade in only when there's more
 * content past an edge - a cue that the content continues. Vertical scrolling
 * cues with top/bottom shadows; horizontal with left/right ones. The container is
 * rounded and clips its content, so the shadows round with it instead of squaring
 * off at the corners.
 *
 * Scrolling is handled by OverlayScrollbars rather than the platform: we render
 * our own slim, floating scrollbar (see `.os-theme-overdone`) so the look is
 * identical on macOS and Windows instead of inheriting each OS's native bar.
 */
export function ScrollArea({
  children,
  orientation = "vertical",
  maxHeight,
  radius = "var(--mantine-radius-md)",
  hideScrollbar,
  style,
}: ScrollAreaProps) {
  const osRef = useRef<OverlayScrollbarsComponentRef>(null);
  const horizontal = orientation === "horizontal";
  // 0..1 strength of the shadow at the start (top/left) and end (bottom/right)
  // edges, scaled by how far there is to scroll in that direction.
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const dark = useComputedColorScheme("light") === "dark";

  // Recompute shadow strengths from the OverlayScrollbars viewport (its internal
  // scroll element, not the host). Driven by the instance's `scroll` and
  // `updated` events, the latter covering viewport resize and content changes.
  const update = useCallback(() => {
    const el = osRef.current?.osInstance()?.elements().viewport;
    if (!el) return;
    const maxScroll = horizontal
      ? el.scrollWidth - el.clientWidth
      : el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) {
      setStart(0);
      setEnd(0);
      return;
    }
    // Strength tracks scroll position across the whole range: the start shadow
    // grows from 0 to full as you scroll toward the end, the end shadow the reverse.
    const frac = (horizontal ? el.scrollLeft : el.scrollTop) / maxScroll;
    setStart(frac);
    setEnd(1 - frac);
  }, [horizontal]);

  const alpha = dark ? 0.4 : 0.14;

  return (
    <div
      style={{
        position: "relative",
        minHeight: 0,
        minWidth: 0,
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
          overflow: horizontal ? { x: "scroll", y: "hidden" } : { x: "hidden", y: "scroll" },
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
        style={horizontal ? { width: "100%" } : { maxHeight: maxHeight ?? "100%" }}
      >
        {children}
      </OverlayScrollbarsComponent>
      <Shadow side={horizontal ? "left" : "top"} strength={start} alpha={alpha} />
      <Shadow side={horizontal ? "right" : "bottom"} strength={end} alpha={alpha} />
    </div>
  );
}

function Shadow({
  side,
  strength,
  alpha,
}: {
  side: "top" | "bottom" | "left" | "right";
  /** 0..1, driven by remaining scroll distance at this edge. */
  strength: number;
  alpha: number;
}) {
  const dir = { top: "to bottom", bottom: "to top", left: "to right", right: "to left" }[side];
  const horizontal = side === "left" || side === "right";
  return (
    <div
      style={{
        position: "absolute",
        // Span the cross axis; sit flush against this edge on the main axis.
        ...(horizontal
          ? { top: 0, bottom: 0, width: SHADOW_SIZE, [side]: 0 }
          : { left: 0, right: 0, height: SHADOW_SIZE, [side]: 0 }),
        pointerEvents: "none",
        background: `linear-gradient(${dir}, rgba(0,0,0,${alpha}), rgba(0,0,0,0))`,
        opacity: strength,
        // Sit above the OverlayScrollbars viewport so the fade isn't scrolled away.
        zIndex: 1,
      }}
    />
  );
}

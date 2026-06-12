import { useComputedColorScheme } from "@mantine/core";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

const SHADOW_HEIGHT = 16;

interface ScrollAreaProps {
  children: ReactNode;
  /** Cap the scroll height (e.g. the lists panel). Omit to fill the parent. */
  maxHeight?: number | string;
  /** Round the shadow corners (e.g. to match a rounded list). */
  radius?: number | string;
  /** Applied to the outer (positioned) container. */
  style?: CSSProperties;
}

/**
 * A vertical scroll container with soft top/bottom shadows that fade in only
 * when there's more content to scroll to in that direction — a cue that the
 * list continues past the edge.
 */
export function ScrollArea({ children, maxHeight, radius, style }: ScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 0..1 strength of each shadow, scaled by how far there is to scroll.
  const [top, setTop] = useState(0);
  const [bottom, setBottom] = useState(0);
  const dark = useComputedColorScheme("light") === "dark";

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
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
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Track both the viewport size and the content height (items added/removed).
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const alpha = dark ? 0.4 : 0.14;

  return (
    <div style={{ position: "relative", minHeight: 0, ...style }}>
      <div
        ref={scrollRef}
        style={{
          overflowY: "auto",
          maxHeight: maxHeight ?? "100%",
          overscrollBehavior: "none",
        }}
      >
        {children}
      </div>
      <Shadow side="top" strength={top} alpha={alpha} radius={radius} />
      <Shadow side="bottom" strength={bottom} alpha={alpha} radius={radius} />
    </div>
  );
}

function Shadow({
  side,
  strength,
  alpha,
  radius,
}: {
  side: "top" | "bottom";
  /** 0..1, driven by remaining scroll distance at this edge. */
  strength: number;
  alpha: number;
  radius?: number | string;
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
        // Round only the outer corners (top edge / bottom edge) so it follows
        // the rounded list rather than reading as a pill.
        ...(side === "top"
          ? { borderTopLeftRadius: radius, borderTopRightRadius: radius }
          : { borderBottomLeftRadius: radius, borderBottomRightRadius: radius }),
        opacity: strength,
      }}
    />
  );
}

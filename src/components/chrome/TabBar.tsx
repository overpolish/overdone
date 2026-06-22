/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, Text } from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { Fragment, type PointerEvent as ReactPointerEvent, useRef, useState } from "react";

import { useLists } from "../../lib/lists";
import { useTodos } from "../../lib/todos";
import { IconButton } from "../ui/IconButton";
import { ScrollArea } from "../ui/ScrollArea";

const MAX_TAB_WIDTH = 180;
/** The faint seam under the bar; the active tab shares it so it reads as one with
 * the divider. */
const SEAM = "color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)";
/** Each tab carries its id so the reorder drag can locate tab geometry by id. */
const TAB_ATTR = "data-tab-id";
/** Movement (px) before a press becomes a reorder drag rather than a click. */
const THRESHOLD = 4;
/** Edge band (px) and per-frame speed for autoscroll while dragging near an end. */
const EDGE = 28;
const SPEED = 8;

/** Nearest horizontally-scrollable ancestor (the OverlayScrollbars viewport), so
 * a drag near the bar's edge can scroll it. */
function horizontalScroller(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const ox = getComputedStyle(node).overflowX;
    if ((ox === "auto" || ox === "scroll") && node.scrollWidth > node.clientWidth) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Quick-switch tab bar under the titlebar: one tab per open list, in tab order.
 * Tabs are read-only labels - renaming lives in the Lists panel - that switch the
 * active list across windows when clicked; the active tab shows the live title so
 * it stays in sync. Tabs drag horizontally to reorder. Every tab has a close
 * button that removes it (and switches away when it was active). Horizontal
 * overflow scrolls with edge fade-shadows instead of a scrollbar. Hidden only
 * when no list is open.
 */
export function TabBar() {
  const lists = useLists((s) => s.lists);
  const openIds = useLists((s) => s.openIds);
  const activeId = useLists((s) => s.activeId);
  const setActive = useLists((s) => s.setActive);
  const closeTab = useLists((s) => s.closeTab);
  const moveTab = useLists((s) => s.moveTab);
  // The active list's title is mirrored live here so a rename (made in the Lists
  // panel) updates its tab immediately, before the lists index re-scans.
  const activeTitle = useTodos((s) => s.title);

  // Open lists in tab order, dropping any that no longer exist.
  const tabs = openIds.filter((id) => lists.some((l) => l.id === id));

  const groupRef = useRef<HTMLDivElement>(null);
  // Id of the tab being dragged (dimmed in place), and the gap index where it
  // would land (null = no-op gap, so no indicator). Both drive the render.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // Latest values for the pointer-up closure, and a flag so the click that
  // follows a drag doesn't also switch lists.
  const dropIndexRef = useRef<number | null>(null);
  const didDragRef = useRef(false);

  const setDrop = (idx: number | null) => {
    dropIndexRef.current = idx;
    setDropIndex(idx);
  };

  // Reorder drag: tabs stay put, a thin bar marks where the dragged tab lands. A
  // rAF loop drives autoscroll + the indicator so holding near an edge keeps
  // scrolling even when the pointer isn't moving.
  const onTabPointerDown = (id: string, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    didDragRef.current = false;
    const startX = e.clientX;
    // Tab order is captured at press time so mid-drop geometry maps cleanly.
    const order = tabs;
    const dragPos = order.indexOf(id);
    let dragging = false;
    let lastX = startX;
    let raf = 0;
    let scroller: HTMLElement | null = null;

    const autoscroll = () => {
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      if (lastX < rect.left + EDGE) scroller.scrollLeft -= SPEED;
      else if (lastX > rect.right - EDGE) scroller.scrollLeft += SPEED;
    };

    const compute = () => {
      const container = groupRef.current;
      if (!container) return;
      const els = Array.from(container.querySelectorAll<HTMLElement>(`[${TAB_ATTR}]`));
      let idx = els.length;
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        if (lastX < r.left + r.width / 2) {
          idx = i;
          break;
        }
      }
      // The gaps either side of the dragged tab wouldn't move it: show nothing.
      setDrop(idx === dragPos || idx === dragPos + 1 ? null : idx);
    };

    const tick = () => {
      autoscroll();
      compute();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (ev: PointerEvent) => {
      lastX = ev.clientX;
      if (!dragging && Math.abs(ev.clientX - startX) > THRESHOLD) {
        dragging = true;
        didDragRef.current = true;
        setDragId(id);
        document.body.style.userSelect = "none";
        scroller = horizontalScroller(groupRef.current);
        raf = requestAnimationFrame(tick);
      }
      if (dragging) ev.preventDefault();
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(raf);
      if (dragging) {
        const idx = dropIndexRef.current;
        // The indicator sits before this tab (or the end when past the last one).
        if (idx != null) moveTab(id, order[idx] ?? null);
        document.body.style.userSelect = "";
      }
      setDragId(null);
      setDrop(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  if (tabs.length === 0) return null;

  return (
    <Box
      style={{
        flexShrink: 0,
        background: "var(--mantine-color-body)",
        borderBottom: `1px solid ${SEAM}`,
      }}
    >
      {/* Horizontal scroll with edge fade-shadows instead of a scrollbar, so a
          crowded bar cues that there's more without a visible bar. */}
      <ScrollArea orientation="horizontal" radius={0} hideScrollbar>
        <Group ref={groupRef} gap={4} wrap="nowrap" px="xs">
          {tabs.map((id, i) => {
            const active = id === activeId;
            return (
              <Fragment key={id}>
                {dropIndex === i && <DropBar />}
                <Tab
                  id={id}
                  title={active ? activeTitle : (lists.find((l) => l.id === id)?.title ?? "")}
                  active={active}
                  dragging={id === dragId}
                  onPointerDown={(e) => onTabPointerDown(id, e)}
                  onSelect={() => {
                    if (didDragRef.current) return;
                    setActive(id);
                  }}
                  onClose={() => closeTab(id)}
                />
              </Fragment>
            );
          })}
          {dropIndex === tabs.length && <DropBar />}
        </Group>
      </ScrollArea>
    </Box>
  );
}

/** The reorder drop marker: a thin accent bar sitting in a tab gap. Negative
 * margins keep it from widening the gap (so tabs don't jitter as it moves). */
function DropBar() {
  return (
    <Box
      style={{
        width: 2,
        alignSelf: "stretch",
        marginInline: -1,
        borderRadius: 2,
        background: "var(--mantine-primary-color-filled)",
        flexShrink: 0,
      }}
    />
  );
}

interface TabProps {
  id: string;
  title: string;
  active: boolean;
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onSelect: () => void;
  onClose: () => void;
}

function Tab({ id, title, active, dragging, onPointerDown, onSelect, onClose }: TabProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <Box
      {...{ [TAB_ATTR]: id }}
      role={active ? undefined : "button"}
      onClick={onSelect}
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        maxWidth: MAX_TAB_WIDTH,
        paddingLeft: 10,
        paddingRight: 4,
        paddingTop: 4,
        paddingBottom: 0,
        cursor: active ? "default" : "pointer",
        // Dim the tab while it's the one being dragged, like the todo reorder row.
        opacity: dragging ? 0.4 : 1,
        // Rounded on top, flat on the bottom edge so the tab sits on the bar's
        // seam like a browser tab.
        borderTopLeftRadius: "var(--mantine-radius-md)",
        borderTopRightRadius: "var(--mantine-radius-md)",
        background: active ? SEAM : hovered ? "var(--mantine-color-default-hover)" : "transparent",
        transition: "background 120ms ease",
      }}
    >
      <Text
        size="xs"
        fw={active ? 600 : 400}
        truncate
        c={active ? undefined : "dimmed"}
        style={{ minWidth: 0 }}
      >
        {title || "Untitled"}
      </Text>
      {/* Close reuses the shared icon button (matching the app's other x/close
          buttons); revealed on hover, or kept visible on the active tab. The
          stopPropagation wrappers keep the press from starting a drag and the
          click from also switching the list. */}
      <Box
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ opacity: hovered || active ? 1 : 0, transition: "opacity 120ms ease" }}
      >
        <IconButton
          icon={IconX}
          label={`Close ${title || "Untitled"}`}
          onClick={onClose}
          danger
          compact
        />
      </Box>
    </Box>
  );
}

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, Text } from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { useState } from "react";

import { useLists } from "../lib/lists";
import { useTodos } from "../lib/todos";
import { IconButton } from "./IconButton";
import { ScrollArea } from "./ScrollArea";

const MAX_TAB_WIDTH = 180;
/** The faint seam under the bar; the active tab shares it so it reads as one with
 * the divider. */
const SEAM = "color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)";

/**
 * Quick-switch tab bar under the titlebar: one tab per open list, in tab order.
 * Tabs are read-only labels - renaming lives in the Lists panel - that switch the
 * active list across windows when clicked; the active tab shows the live title so
 * it stays in sync. Every tab has a close button that removes it (and switches
 * away when it was active). Horizontal overflow scrolls with edge fade-shadows
 * instead of a scrollbar. Hidden only when no list is open.
 */
export function TabBar() {
  const lists = useLists((s) => s.lists);
  const openIds = useLists((s) => s.openIds);
  const activeId = useLists((s) => s.activeId);
  const setActive = useLists((s) => s.setActive);
  const closeTab = useLists((s) => s.closeTab);
  // The active list's title is mirrored live here so a rename (made in the Lists
  // panel) updates its tab immediately, before the lists index re-scans.
  const activeTitle = useTodos((s) => s.title);

  // Open lists in tab order, dropping any that no longer exist.
  const tabs = openIds.filter((id) => lists.some((l) => l.id === id));
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
        <Group gap={4} wrap="nowrap" px="xs">
          {tabs.map((id) => {
            const active = id === activeId;
            return (
              <Tab
                key={id}
                title={active ? activeTitle : (lists.find((l) => l.id === id)?.title ?? "")}
                active={active}
                onSelect={() => setActive(id)}
                onClose={() => closeTab(id)}
              />
            );
          })}
        </Group>
      </ScrollArea>
    </Box>
  );
}

interface TabProps {
  title: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}

function Tab({ title, active, onSelect, onClose }: TabProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <Box
      role={active ? undefined : "button"}
      onClick={active ? undefined : onSelect}
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
          stopPropagation wrapper keeps the click from also switching the list. */}
      <Box
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

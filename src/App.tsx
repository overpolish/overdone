/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Stack, Text } from "@mantine/core";
import { IconFilter, IconKeyboard, IconListCheck } from "@tabler/icons-react";
import { useEffect } from "react";

import { DailyReviewBanner, Footer, TabBar, Titlebar } from "./components/chrome";
import { ItemContextMenu } from "./components/item-menu";
import { ScrollArea } from "./components/ui";
import { TodoItem } from "./components/todo-item";
import { useVisibleItems } from "./lib/filters";
import {
  useGlobalKeyboard,
  useMainWindowStartup,
  useNotificationScheduler,
  usePanelActionListeners,
  useTrayAlert,
} from "./lib/main-events";
import { useDrag } from "./lib/reorder";
import { useSelection } from "./lib/selection";
import { useTodos } from "./lib/todos";
import { useUpdateCheck } from "./lib/update";

/** Line showing where a dragged item will land (positioned via the drag store). */
function DropIndicator() {
  const id = useDrag((s) => s.id);
  const dropY = useDrag((s) => s.dropY);
  if (id === null || dropY === null) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: "var(--mantine-spacing-sm)",
        right: "var(--mantine-spacing-sm)",
        top: dropY,
        height: 2,
        marginTop: -1,
        borderRadius: 2,
        background: "var(--mantine-primary-color-filled)",
        pointerEvents: "none",
      }}
    />
  );
}

function App() {
  const items = useTodos((s) => s.items);
  // Null when the last tab was closed: no list is open (a distinct empty state
  // from an open-but-empty list).
  const noList = useTodos((s) => s.activeId === null);
  // The list as displayed: the active filter hides non-matches and view-sorts.
  // Schedulers/tray still track the full item set, not the visible subset.
  const visible = useVisibleItems();
  // Drives the contiguous selection highlight: each row needs to know whether its
  // visible neighbours are also selected so a run of them merges into one region.
  const selectedIds = useSelection((s) => s.ids);

  useMainWindowStartup();
  usePanelActionListeners();
  useNotificationScheduler(items);
  useTrayAlert(items);
  useGlobalKeyboard();
  useUpdateCheck();

  // Escape clears a multi-selection (the menu's own Escape handler closes it
  // first, so this only fires once the menu is gone).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useSelection.getState().clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        // Only the items area (below) scrolls; the window itself never does.
        overflow: "hidden",
      }}
    >
      <Titlebar />

      <TabBar />

      <DailyReviewBanner />

      <ScrollArea radius={0} style={{ flex: 1 }}>
        <Stack gap={0} p="sm" pos="relative">
          {noList ? (
            <Stack align="center" gap={6} pt="xl" c="dimmed">
              <IconListCheck size={40} stroke={1.5} opacity={0.5} />
              <Text size="sm" ta="center">
                No list open
              </Text>
              <Text size="xs" ta="center" opacity={0.7}>
                Open one from Lists (⌘L)
              </Text>
            </Stack>
          ) : items.length === 0 ? (
            <Stack align="center" gap={6} pt="xl" c="dimmed">
              <IconKeyboard size={40} stroke={1.5} opacity={0.5} />
              <Text size="sm" ta="center">
                Start typing to add items
              </Text>
            </Stack>
          ) : visible.length === 0 ? (
            <Stack align="center" gap={6} pt="xl" c="dimmed">
              <IconFilter size={40} stroke={1.5} opacity={0.5} />
              <Text size="sm" ta="center">
                No items match the filter
              </Text>
            </Stack>
          ) : (
            visible.map((item, i) => (
              <TodoItem
                key={item.id}
                item={item}
                selPrev={i > 0 && selectedIds.has(visible[i - 1].id)}
                selNext={i < visible.length - 1 && selectedIds.has(visible[i + 1].id)}
              />
            ))
          )}
          <DropIndicator />
        </Stack>
      </ScrollArea>

      {!noList && <Footer />}
      <ItemContextMenu />
    </div>
  );
}

export default App;

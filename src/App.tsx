/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Button, Stack, Text } from "@mantine/core";
import { IconFilter, IconKeyboard, IconListCheck } from "@tabler/icons-react";

import { DailyReviewBanner } from "./components/DailyReviewBanner";
import { Footer } from "./components/Footer";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { ScrollArea } from "./components/ScrollArea";
import { TodoItem } from "./components/todo-item";
import { Titlebar } from "./components/Titlebar";
import { useVisibleItems } from "./lib/filters";
import {
  useGlobalKeyboard,
  useMainWindowStartup,
  useNotificationScheduler,
  usePanelActionListeners,
  useTrayAlert,
} from "./lib/main-events";
import { useLists } from "./lib/lists";
import { useDrag } from "./lib/reorder";
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
  // Null when every list has been deleted: nothing's loaded, so the items area
  // gives way to a "create a list" prompt.
  const activeId = useTodos((s) => s.activeId);
  // The list as displayed: the active filter hides non-matches and view-sorts.
  // Schedulers/tray still track the full item set, not the visible subset.
  const visible = useVisibleItems();

  useMainWindowStartup();
  usePanelActionListeners();
  useNotificationScheduler(items);
  useTrayAlert(items);
  useGlobalKeyboard();
  useUpdateCheck();

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

      <DailyReviewBanner />

      <ScrollArea radius={0} style={{ flex: 1 }}>
        <Stack gap={0} p="sm" pos="relative">
          {activeId === null ? (
            <Stack align="center" gap={10} pt="xl" c="dimmed">
              <IconListCheck size={40} stroke={1.5} opacity={0.5} />
              <Text size="sm" ta="center">
                No list open
              </Text>
              <Button
                size="xs"
                variant="default"
                onClick={() => void useLists.getState().create()}
              >
                Create a list
              </Button>
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
            visible.map((item) => <TodoItem key={item.id} item={item} />)
          )}
          <DropIndicator />
        </Stack>
      </ScrollArea>

      <Footer />
      <ItemContextMenu />
    </div>
  );
}

export default App;

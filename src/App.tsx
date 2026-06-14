import { Stack, Text } from "@mantine/core";
import { IconKeyboard } from "@tabler/icons-react";

import { Footer } from "./components/Footer";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { ScrollArea } from "./components/ScrollArea";
import { TodoItem } from "./components/todo-item";
import { Titlebar } from "./components/Titlebar";
import {
  useGlobalKeyboard,
  useMainWindowStartup,
  useNotificationScheduler,
  usePanelActionListeners,
  useTrayAlert,
} from "./lib/main-events";
import { useDrag } from "./lib/reorder";
import { useTodos } from "./lib/todos";

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

  useMainWindowStartup();
  usePanelActionListeners();
  useNotificationScheduler(items);
  useTrayAlert(items);
  useGlobalKeyboard();

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

      <ScrollArea radius={0} style={{ flex: 1 }}>
        <Stack gap={0} p="sm" pos="relative">
          {items.length === 0 ? (
            <Stack align="center" gap={6} pt="xl" c="dimmed">
              <IconKeyboard size={40} stroke={1.5} opacity={0.5} />
              <Text size="sm" ta="center">
                Start typing to add items
              </Text>
            </Stack>
          ) : (
            items.map((item) => <TodoItem key={item.id} item={item} />)
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

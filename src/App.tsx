import { Stack, Text } from "@mantine/core";
import { IconKeyboard } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { Footer } from "./components/Footer";
import { ScrollArea } from "./components/ScrollArea";
import { TodoItem } from "./components/TodoItem";
import { Titlebar } from "./components/Titlebar";
import { bindMainWindow } from "./lib/main-sync";
import { type StatusAction } from "./lib/panel";
import { useDrag } from "./lib/reorder";
import { useSettings } from "./lib/settings";
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

/** Whether focus is currently in a text field (input/textarea/contenteditable). */
function isEditableFocused() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable
  );
}

function App() {
  const items = useTodos((s) => s.items);

  // Load the active list and start autosaving (main window only).
  useEffect(() => {
    bindMainWindow();
  }, []);

  // Apply status picks made in the floating panel back to the store.
  useEffect(() => {
    const unlisten = listen<StatusAction>("status:action", (e) => {
      const { itemId, type, state } = e.payload;
      const todos = useTodos.getState();
      if (type === "delete") todos.deleteItem(itemId);
      else if (state) todos.setItemState(itemId, state);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Apply the persisted always-on-top preference on startup.
  useEffect(() => {
    void invoke("set_always_on_top", {
      value: useSettings.getState().alwaysOnTop,
    });
  }, []);

  // Global keyboard handling. Shortcuts (Cmd/Ctrl+Z / Shift / Y) take priority;
  // otherwise, typing a printable character while no field is focused starts a
  // new item at the top, seeded with that character.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod) {
        const key = e.key.toLowerCase();
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) useTodos.getState().redo();
          else useTodos.getState().undo();
        } else if (key === "y") {
          e.preventDefault();
          useTodos.getState().redo();
        }
        return;
      }

      // Escape drops focus out of the current field, so you can esc then type
      // to start a fresh item.
      if (e.key === "Escape") {
        if (isEditableFocused()) (document.activeElement as HTMLElement).blur();
        return;
      }

      // Type-to-create. Skip when a field is already being edited, when Alt is
      // held (Option produces special glyphs), and for non-printable keys
      // (Enter, arrows… all report multi-character `key` names).
      if (e.altKey || e.key.length !== 1) return;
      if (isEditableFocused()) return;
      e.preventDefault();
      useTodos.getState().addItem(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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

      <ScrollArea style={{ flex: 1 }}>
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
    </div>
  );
}

export default App;

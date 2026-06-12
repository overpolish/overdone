import { Stack } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";

import { Footer } from "./components/Footer";
import { TodoItem } from "./components/TodoItem";
import { Titlebar } from "./components/Titlebar";
import { bindMainWindow } from "./lib/main-sync";
import { useSettings } from "./lib/settings";
import { useTodos } from "./lib/todos";

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

      <div style={{ flex: 1, overflow: "auto", overscrollBehavior: "none" }}>
        <Stack gap="xs" p="md">
          {items.map((item) => (
            <TodoItem key={item.id} item={item} />
          ))}
        </Stack>
      </div>

      <Footer />
    </div>
  );
}

export default App;

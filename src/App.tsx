import { Stack, Text } from "@mantine/core";
import { IconKeyboard } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

import { Footer } from "./components/Footer";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { ScrollArea } from "./components/ScrollArea";
import { TodoItem } from "./components/TodoItem";
import { Titlebar } from "./components/Titlebar";
import { bindMainWindow } from "./lib/main-sync";
import {
  type AssigneeAction,
  type DatesAction,
  type DetailsAction,
  type EditActionType,
  type RosterAction,
  type StatusAction,
} from "./lib/panel";
import { notify } from "./lib/notifications";
import { isStruck } from "./lib/todo";
import { useDrag } from "./lib/reorder";
import { useSettings } from "./lib/settings";
import { type TodoData, useTodos } from "./lib/todos";

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

  // In passthrough mode, clicking the (modifier-revealed) window should focus it
  // so it stays interactive. `acceptFirstMouse` delivers the click to the content
  // but doesn't activate the window, so focus it explicitly.
  useEffect(() => {
    const onPointerDown = () => {
      if (useSettings.getState().passthrough) void getCurrentWindow().setFocus();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
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

  // Jump to an item picked from search: focus it and bring the window forward.
  useEffect(() => {
    const unlisten = listen<string>("search:focus", (e) => {
      useTodos.getState().focusItem(e.payload);
      void getCurrentWindow().setFocus();
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Apply comment-log changes made in the details panel back to the store.
  useEffect(() => {
    const unlisten = listen<DetailsAction>("details:action", (e) => {
      const { itemId, comments } = e.payload;
      useTodos.getState().setItemComments(itemId, comments);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Apply assignee changes made in the details panel: register any newly created
  // roster members first, then set the item's assignee list.
  useEffect(() => {
    const unlisten = listen<AssigneeAction>("assignee:action", (e) => {
      const { itemId, assigneeIds, newAssignees } = e.payload;
      const todos = useTodos.getState();
      newAssignees?.forEach((a) => todos.addAssignee(a));
      todos.setItemAssignees(itemId, assigneeIds);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Apply notification-time / due-date changes made in the details panel.
  useEffect(() => {
    const unlisten = listen<DatesAction>("dates:action", (e) => {
      const { itemId, notifyAt, dueDate } = e.payload;
      useTodos.getState().setItemDates(itemId, { notifyAt, dueDate });
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Fire a desktop reminder when an item's notification time arrives. We re-arm
  // a timer per item whenever the item set changes; a past-due time fires at
  // once. Firing flags the item as "needs action" (markNotified clears notifyAt
  // and sets notifiedAt), so it's one-shot — it won't re-fire on the next change
  // or a restart, and stays amber + belled in the list until dismissed.
  useEffect(() => {
    // setTimeout overflows past the 32-bit ms range and would fire instantly;
    // skip far-future reminders here — they re-arm once the time is in range
    // (on the next item change or app restart).
    const MAX_DELAY = 2 ** 31 - 1;
    const fire = (item: TodoData) => {
      void notify("Item needs action", item.text);
      useTodos.getState().markNotified(item.id);
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const item of items) {
      // A resolved (done/cancelled) item never notifies; reopening re-arms it.
      if (item.notifyAt == null || isStruck(item.state)) continue;
      const delay = item.notifyAt - Date.now();
      if (delay <= 0) fire(item);
      else if (delay <= MAX_DELAY) timers.push(setTimeout(() => fire(item), delay));
    }
    return () => timers.forEach((t) => clearTimeout(t));
  }, [items]);

  // Keep the red tray badge lit while any item has an unacknowledged
  // notification, and clear it once they're all dismissed. The badge tracks
  // pending notifications (not window focus), so it survives focusing the app
  // and persists across restarts (notifiedAt is saved). Only toggle on change to
  // avoid re-setting the tray icon on every keystroke.
  const trayAlertRef = useRef(false);
  useEffect(() => {
    const pending = items.some((i) => i.notifiedAt != null);
    if (pending === trayAlertRef.current) return;
    trayAlertRef.current = pending;
    void invoke("set_tray_alert", { on: pending });
  }, [items]);

  // Clear the "item being edited" row highlight when the panel hides (blur,
  // Escape, status pick, etc.). Opening a panel sets it; this is the close side.
  useEffect(() => {
    const unlisten = listen("panel:closed", () => {
      useTodos.getState().setEditingId(null);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Undo/redo forwarded from a focused panel window (which can't reach the
  // store itself).
  useEffect(() => {
    const unlisten = listen<EditActionType>("edit:action", (e) => {
      const todos = useTodos.getState();
      if (e.payload === "redo") todos.redo();
      else todos.undo();
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Apply roster management changes made in Settings back to the store.
  useEffect(() => {
    const unlisten = listen<RosterAction>("roster:action", (e) => {
      const todos = useTodos.getState();
      const a = e.payload;
      if (a.type === "add") todos.addAssignee(a.assignee);
      else if (a.type === "rename") todos.renameAssignee(a.id, a.name);
      else if (a.type === "recolor") todos.setAssigneeColor(a.id, a.color);
      else if (a.type === "remove") todos.removeAssignee(a.id);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Apply persisted window preferences on startup.
  useEffect(() => {
    const { alwaysOnTop, passthrough, excludeFromCapture } = useSettings.getState();
    void invoke("set_always_on_top", { value: alwaysOnTop });
    void invoke("set_passthrough", { value: passthrough });
    void invoke("set_content_protected", { value: excludeFromCapture });
    // The OS login-item registration is the source of truth for autostart;
    // reconcile the toggle to it (without re-invoking enable/disable).
    void isAutostartEnabled()
      .then((on) => useSettings.setState({ launchAtStartup: on }))
      .catch(() => {});
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

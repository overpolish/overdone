/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import {
  importMarkdown,
  parseList,
  renderMarkdown,
  serializeList,
} from "./markdown";

/** One stored list as surfaced in the lists picker. */
export interface ListMeta {
  id: string;
  title: string;
  /** Disk usage (markdown + attachments) in bytes, from the backend. */
  bytes: number;
}

/** One trashed (soft-deleted) list, as surfaced in the Trash view. */
export interface TrashMeta extends ListMeta {
  /** Epoch ms when the list was deleted (drives the "deleted X ago" label and
   * the 30-day auto-purge). */
  deletedAt: number;
}

interface ListsState {
  /** All stored lists, sorted by title (as returned by the backend). */
  lists: ListMeta[];
  /** Id of the active list, mirrored across windows. */
  activeId: string | null;
  /** Ids of the open lists shown as tabs, in tab order. Opening a list adds it
   * here; closing its tab removes it. Persisted and mirrored across windows. */
  openIds: string[];
  /** Re-scan the lists directory. */
  refresh: () => Promise<void>;
  /** Open a list (adding it as a tab if needed) and make it active. Persisted +
   * broadcast. */
  setActive: (id: string) => void;
  /** Clear the active list - no list open (closed the last tab). */
  closeActive: () => void;
  /** Close a list's tab. If it was active, switch to a neighbouring tab, or clear
   * the active list when it was the last one. */
  closeTab: (id: string) => void;
  /** Reorder the open tabs: move `id` to just before `beforeId`, or to the end
   * when null. Persisted + broadcast like the other tab mutations. */
  moveTab: (id: string, beforeId: string | null) => void;
  /** Create a new untitled list, make it active, and return its id. */
  create: () => Promise<string>;
  /** Delete a list; if open/active, close its tab and switch away. */
  remove: (id: string) => Promise<void>;
  /** Rename a list. The actual file write is performed by the main window. */
  rename: (id: string, title: string) => void;
}

const ACTIVE_KEY = "overdone-active-list";
const OPEN_KEY = "overdone-open-lists";
/** Legacy key (lists pinned to the tab bar), read once to migrate into OPEN_KEY. */
const LEGACY_PINNED_KEY = "overdone-pinned-lists";
const CHANNEL_NAME = "overdone:lists";

/** localStorage read that never throws (private-mode / disabled storage). */
function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** localStorage write that never throws; a null value removes the key. */
function lsSet(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

const loadActiveId = (): string | null => lsGet(ACTIVE_KEY);
const persistActiveId = (id: string | null) => lsSet(ACTIVE_KEY, id);

function loadOpenIds(): string[] {
  // Migrate the old "pinned" tab set into the new "open" tab set.
  const raw = lsGet(OPEN_KEY) ?? lsGet(LEGACY_PINNED_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

const persistOpenIds = (ids: string[]) => lsSet(OPEN_KEY, JSON.stringify(ids));

// Cross-window channel. `applyingRemote` breaks the received -> set -> broadcast
// echo, mirroring the settings store's approach.
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(CHANNEL_NAME)
    : null;
let applyingRemote = false;

type ListsMessage =
  | { type: "refresh" }
  | { type: "active"; id: string | null }
  | { type: "open"; ids: string[] }
  | { type: "rename"; id: string; title: string };

function broadcast(message: ListsMessage) {
  if (!channel || applyingRemote) return;
  channel.postMessage(message);
}

// The main window registers a writer that performs the actual rename on disk
// (it's the sole writer of list files, so renames from the panel funnel to it).
let renameWriter: ((id: string, title: string) => void) | null = null;
export function setRenameWriter(fn: (id: string, title: string) => void) {
  renameWriter = fn;
}

/** Apply a title to the in-memory lists index (optimistic / on-receive). */
function applyTitle(id: string, title: string) {
  useLists.setState((s) => ({
    lists: s.lists.map((l) => (l.id === id ? { ...l, title } : l)),
  }));
}

export const useLists = create<ListsState>((set, get) => {
  // Each mutation of the cross-window state (the active list, the open tabs) is
  // the same trio: update the store, persist it, and broadcast it to the other
  // windows. These keep that contract in one place.
  const commitActive = (id: string | null) => {
    set({ activeId: id });
    persistActiveId(id);
    broadcast({ type: "active", id });
  };
  const commitOpen = (ids: string[]) => {
    set({ openIds: ids });
    persistOpenIds(ids);
    broadcast({ type: "open", ids });
  };

  return {
    lists: [],
    activeId: loadActiveId(),
    openIds: loadOpenIds(),

    refresh: async () => {
      const lists = await invoke<ListMeta[]>("list_lists");
      set({ lists });
    },

    setActive: (id) => {
      const { activeId, openIds } = get();
      // Opening a list adds it as a tab (at the end) if it isn't one already.
      if (!openIds.includes(id)) commitOpen([...openIds, id]);
      if (activeId !== id) commitActive(id);
    },

    closeActive: () => {
      if (get().activeId !== null) commitActive(null);
    },

    closeTab: (id) => {
      const { openIds, activeId } = get();
      const idx = openIds.indexOf(id);
      if (idx === -1) return;
      const ids = openIds.filter((x) => x !== id);
      commitOpen(ids);
      // Closing the active tab activates a neighbour (the next tab, else the
      // previous); with none left, no list is open.
      if (activeId === id) {
        const neighbour = ids[idx] ?? ids[idx - 1];
        if (neighbour) get().setActive(neighbour);
        else get().closeActive();
      }
    },

    moveTab: (id, beforeId) => {
      const { openIds } = get();
      if (!openIds.includes(id) || id === beforeId) return;
      const next = openIds.filter((x) => x !== id);
      const at = beforeId ? next.indexOf(beforeId) : next.length;
      next.splice(at === -1 ? next.length : at, 0, id);
      // Skip a no-op reorder so we don't persist/broadcast needlessly.
      if (next.length === openIds.length && next.every((x, i) => x === openIds[i])) return;
      commitOpen(next);
    },

    create: async () => {
      const id = crypto.randomUUID();
      // Empty title so the active list opens with its title field focused.
      await invoke("write_list", { id, content: "# \n" });
      await get().refresh();
      broadcast({ type: "refresh" });
      get().setActive(id);
      return id;
    },

    remove: async (id) => {
      await invoke("delete_list", { id });
      // Close its tab (switching away if it was active), then re-scan.
      get().closeTab(id);
      await get().refresh();
      broadcast({ type: "refresh" });
    },

    rename: (id, title) => {
      applyTitle(id, title);
      broadcast({ type: "rename", id, title });
      // If this is the main window, write immediately; otherwise the broadcast
      // reaches the main window, which writes.
      renameWriter?.(id, title);
    },
  };
});

/** Notify other windows that a list's contents changed (e.g. after autosave). */
export function broadcastListsChanged() {
  broadcast({ type: "refresh" });
}

/** The trashed lists, newest-deleted first (auto-purged after 30 days). */
export function listTrash(): Promise<TrashMeta[]> {
  return invoke<TrashMeta[]>("list_trash");
}

/** Restore a trashed list, then make it the active list. */
export async function restoreList(id: string): Promise<void> {
  await invoke("restore_list", { id });
  await useLists.getState().refresh();
  broadcast({ type: "refresh" });
  useLists.getState().setActive(id);
}

/** Permanently delete a trashed list (the "delete forever" action). */
export async function purgeList(id: string): Promise<void> {
  await invoke("purge_list", { id });
}

/**
 * Export a list as clean, human-readable markdown via a Save dialog (pre-filled
 * with the title as the filename), alongside a `media/` subfolder of attachments
 * so the markdown's relative references resolve. The stored file uses a
 * metadata-laden round-trip format; here we re-render it through
 * {@link renderMarkdown} so the exported file reads like real markdown. Returns
 * the chosen folder, or null if cancelled.
 */
export async function exportList(
  id: string,
  title: string,
): Promise<string | null> {
  const name = (title.trim() || "Untitled").replace(/[/\\:]/g, "-");
  const path = await saveDialog({
    title: "Export list",
    defaultPath: `${name}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!path) return null;
  const stored = await invoke<string>("read_list", { id });
  const parsed = parseList(stored);
  const content = renderMarkdown(
    parsed.title || title,
    parsed.items,
    parsed.assignees,
    parsed.labels,
  );
  // Split the chosen path into the destination folder + filename the backend
  // expects (it drops the `media/` subfolder beside the file).
  const m = path.match(/^(.*)[/\\]([^/\\]+)$/);
  const dir = m ? m[1] : ".";
  const fileName = m ? m[2] : path;
  await invoke("export_list_to_dir", { id, dir, fileName, content });
  return dir;
}

/**
 * Import a user-picked markdown file into a new list, made active. The file is
 * parsed with the best-effort {@link importMarkdown} (the inverse of export: it
 * reads clean markdown / GitHub task lists, not our metadata-laden storage
 * format), then written out in the round-trip storage format. The list's title
 * comes from the file's `# ` heading, falling back to its filename. Returns the
 * new list's id, or null if cancelled.
 */
export async function importList(): Promise<string | null> {
  const file = await openDialog({
    multiple: false,
    title: "Import a markdown list",
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });
  if (!file || Array.isArray(file)) return null;
  const content = await invoke<string>("read_text_file", { path: file });
  const parsed = importMarkdown(content);
  const base = file.split(/[/\\]/).pop() ?? "";
  const title = parsed.title || base.replace(/\.(md|markdown|txt)$/i, "");
  const id = crypto.randomUUID();
  const markdown = serializeList(
    title,
    parsed.items,
    parsed.assignees,
    parsed.labels,
  );
  await invoke("write_list", { id, content: markdown });
  await useLists.getState().refresh();
  broadcast({ type: "refresh" });
  useLists.getState().setActive(id);
  return id;
}

if (channel) {
  channel.onmessage = (event) => {
    const message = event.data as ListsMessage;
    applyingRemote = true;
    try {
      if (message.type === "refresh") {
        void useLists.getState().refresh();
      } else if (message.type === "active") {
        useLists.setState({ activeId: message.id });
        persistActiveId(message.id);
      } else if (message.type === "open") {
        useLists.setState({ openIds: message.ids });
        persistOpenIds(message.ids);
      } else if (message.type === "rename") {
        applyTitle(message.id, message.title);
        // Only the main window has a writer registered; it performs the write.
        renameWriter?.(message.id, message.title);
      }
    } finally {
      applyingRemote = false;
    }
  };
}

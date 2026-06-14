/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import { parseList, renderMarkdown } from "./markdown";

/** One stored list as surfaced in the lists picker. */
export interface ListMeta {
  id: string;
  title: string;
  /** Disk usage (markdown + attachments) in bytes, from the backend. */
  bytes: number;
}

interface ListsState {
  /** All stored lists, sorted by title (as returned by the backend). */
  lists: ListMeta[];
  /** Id of the active list, mirrored across windows. */
  activeId: string | null;
  /** Re-scan the lists directory. */
  refresh: () => Promise<void>;
  /** Switch the active list (persisted + broadcast to the other window). */
  setActive: (id: string) => void;
  /** Create a new untitled list, make it active, and return its id. */
  create: () => Promise<string>;
  /** Delete a list; if it was active, fall back to another (or none). */
  remove: (id: string) => Promise<void>;
  /** Rename a list. The actual file write is performed by the main window. */
  rename: (id: string, title: string) => void;
}

const ACTIVE_KEY = "overdone-active-list";
const CHANNEL_NAME = "overdone:lists";

function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function persistActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore
  }
}

// Cross-window channel. `applyingRemote` breaks the received -> set -> broadcast
// echo, mirroring the settings store's approach.
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(CHANNEL_NAME)
    : null;
let applyingRemote = false;

type ListsMessage =
  | { type: "refresh" }
  | { type: "active"; id: string }
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

export const useLists = create<ListsState>((set, get) => ({
  lists: [],
  activeId: loadActiveId(),

  refresh: async () => {
    const lists = await invoke<ListMeta[]>("list_lists");
    set({ lists });
  },

  setActive: (id) => {
    if (get().activeId === id) return;
    set({ activeId: id });
    persistActiveId(id);
    broadcast({ type: "active", id });
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
    await get().refresh();
    broadcast({ type: "refresh" });
    if (get().activeId === id) {
      get().setActive(get().lists[0]?.id ?? "");
    }
  },

  rename: (id, title) => {
    applyTitle(id, title);
    broadcast({ type: "rename", id, title });
    // If this is the main window, write immediately; otherwise the broadcast
    // reaches the main window, which writes.
    renameWriter?.(id, title);
  },
}));

/** Notify other windows that a list's contents changed (e.g. after autosave). */
export function broadcastListsChanged() {
  broadcast({ type: "refresh" });
}

/**
 * Export a list to a user-chosen folder as clean, human-readable markdown
 * (named from the title) plus a `media/` subfolder of attachments, so the
 * markdown's relative references resolve. The stored file uses a metadata-laden
 * round-trip format; here we re-render it through {@link renderMarkdown} so the
 * exported file reads like real markdown. Returns the chosen folder, or null if
 * cancelled.
 */
export async function exportList(
  id: string,
  title: string,
): Promise<string | null> {
  const name = (title.trim() || "Untitled").replace(/[/\\:]/g, "-");
  const dir = await openDialog({ directory: true, title: "Export list to folder" });
  if (!dir || Array.isArray(dir)) return null;
  const stored = await invoke<string>("read_list", { id });
  const parsed = parseList(stored);
  const content = renderMarkdown(
    parsed.title || title,
    parsed.items,
    parsed.assignees,
    parsed.labels,
  );
  await invoke("export_list_to_dir", { id, dir, fileName: `${name}.md`, content });
  return dir;
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

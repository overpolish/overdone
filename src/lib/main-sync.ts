/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";

import { broadcastListsChanged, setRenameWriter, useLists } from "./lists";
import { serializeList, setMarkdownTitle } from "./markdown";
import { emitAssigneesSync } from "./panel";
import { useTodos } from "./todos";

/**
 * Wiring that belongs only to the main window (the one that actually edits a
 * list): keep the loaded todos in sync with the active list, and autosave edits
 * back to disk. The panel window never imports this, so it never loads content
 * or writes files.
 *
 * Coordination point is `useLists.activeId`: changing it (here, from the panel,
 * or restored on launch) loads that list; edits to the loaded list autosave and
 * notify the panel so titles stay fresh.
 */

const SAVE_DELAY_MS = 500;

let bound = false;

export function bindMainWindow() {
  if (bound) return;
  bound = true;

  // Active list changed (panel switch / create) -> load it.
  useLists.subscribe((state, prev) => {
    if (state.activeId && state.activeId !== prev.activeId) {
      void useTodos.getState().open(state.activeId);
    }
  });

  // Autosave: persist edits to the loaded list, debounced. The pending write is
  // tracked explicitly (not just via the timer) so a list switch can flush the
  // previous list's edit before loading the next — otherwise a quick
  // edit-then-switch would cancel the timer and drop the edit.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: { id: string; content: string } | null = null;

  const flush = () => {
    clearTimeout(saveTimer);
    if (!pending) return;
    const { id, content } = pending;
    pending = null;
    void invoke("write_list", { id, content }).then(() => {
      // Let the panel re-read titles (the heading may have changed).
      broadcastListsChanged();
    });
  };

  useTodos.subscribe((state, prev) => {
    // A change in `activeId` is a load/switch, not an edit: flush the previous
    // list's pending write, then wait for the next edit.
    if (state.activeId !== prev.activeId) {
      flush();
      return;
    }
    if (!state.activeId) return;

    // Keep an open assignee picker (a separate window) live with the store, so
    // changes from any source — including undo/redo — reflect there too.
    if (state.items !== prev.items || state.assignees !== prev.assignees) {
      emitAssigneesSync({
        roster: state.assignees,
        byItem: Object.fromEntries(state.items.map((i) => [i.id, i.assignees ?? []])),
      });
    }

    if (
      state.items === prev.items &&
      state.title === prev.title &&
      state.assignees === prev.assignees
    ) {
      return;
    }

    pending = {
      id: state.activeId,
      content: serializeList(state.title, state.items, state.assignees),
    };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DELAY_MS);
  });

  // Last-chance flush if the window is torn down mid-debounce.
  window.addEventListener("beforeunload", flush);

  // Perform renames (from the footer or the lists panel) on disk. The active
  // list goes through the store so it autosaves; any other list is rewritten in
  // place without loading its items.
  setRenameWriter((id, title) => {
    if (useTodos.getState().activeId === id) {
      useTodos.getState().setTitle(title);
      return;
    }
    void invoke<string>("read_list", { id })
      .then((content) =>
        invoke("write_list", { id, content: setMarkdownTitle(content, title) }),
      )
      .then(() => {
        void useLists.getState().refresh();
        broadcastListsChanged();
      })
      .catch(() => {
        // List vanished or unreadable: ignore.
      });
  });

  void init();
}

/** Resolve which list to show on launch, creating a default one if none exist. */
async function init() {
  const lists = useLists.getState();
  await lists.refresh();

  const persisted = lists.activeId;
  const available = useLists.getState().lists;
  const active =
    available.find((l) => l.id === persisted)?.id ?? available[0]?.id ?? null;

  if (!active) {
    // First run: create a default list. `create` sets it active, which the
    // subscription above turns into an `open`.
    await lists.create();
    return;
  }

  useLists.setState({ activeId: active });
  await useTodos.getState().open(active);
}

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";

import { broadcastListsChanged, setRenameWriter, useLists } from "./lists";
import { serializeList, setMarkdownTitle } from "./markdown";
import {
  closePanel,
  emitAssigneesSync,
  emitCommentsSync,
  emitDatesSync,
  emitLabelsSync,
} from "./panel";
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

  // Active list changed (panel switch / create / close) -> load it, or clear the
  // store to the no-list-open state when the last tab is closed.
  useLists.subscribe((state, prev) => {
    if (state.activeId === prev.activeId) return;
    if (state.activeId) void useTodos.getState().open(state.activeId);
    else useTodos.getState().closeList();
  });

  // Autosave: persist edits to the loaded list, debounced. The pending write is
  // tracked explicitly (not just via the timer) so a list switch can flush the
  // previous list's edit before loading the next - otherwise a quick
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
      // An item-scoped panel (details/assignee/status) was editing an item from
      // the list we just left, so dismiss it. Non-item panels (lists, settings,
      // filter, search) don't set editingId and stay open.
      if (prev.editingId) closePanel();
      return;
    }
    if (!state.activeId) return;

    // Keep an open assignee picker (a separate window) live with the store, so
    // changes from any source - including undo/redo - reflect there too.
    if (state.items !== prev.items || state.assignees !== prev.assignees) {
      emitAssigneesSync({
        roster: state.assignees,
        byItem: Object.fromEntries(state.items.map((i) => [i.id, i.assignees ?? []])),
      });
    }
    // Same for an open label picker (in the details panel).
    if (state.items !== prev.items || state.labels !== prev.labels) {
      emitLabelsSync({
        roster: state.labels,
        byItem: Object.fromEntries(state.items.map((i) => [i.id, i.labels ?? []])),
      });
    }
    // Keep an open details panel's NOTIFY / DUE fields live (e.g. a comment that
    // set a reminder, or undo/redo) without needing a reopen.
    if (state.items !== prev.items) {
      emitDatesSync({
        byItem: Object.fromEntries(
          state.items.map((i) => [
            i.id,
            { notifyAt: i.notifyAt, dueDate: i.dueDate, notifyMessage: i.notifyMessage },
          ]),
        ),
      });
    }
    // Same for an open details panel's comment log (undo/redo of a comment, or a
    // delete from elsewhere). Only when some item's comments reference actually
    // changed - a text edit keeps the same comments array, so this stays quiet.
    if (state.items !== prev.items) {
      const before = new Map(prev.items.map((i) => [i.id, i.comments]));
      const changed = state.items.some((i) => before.get(i.id) !== i.comments);
      if (changed) {
        emitCommentsSync({
          byItem: Object.fromEntries(state.items.map((i) => [i.id, i.comments ?? []])),
        });
      }
    }

    if (
      state.items === prev.items &&
      state.title === prev.title &&
      state.assignees === prev.assignees &&
      state.labels === prev.labels
    ) {
      return;
    }

    pending = {
      id: state.activeId,
      content: serializeList(state.title, state.items, state.assignees, state.labels),
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

/** Restore the open tabs and active list on launch, creating a default list when
 * none exist. */
async function init() {
  const lists = useLists.getState();
  await lists.refresh();
  const available = useLists.getState().lists;

  if (available.length === 0) {
    // First run: create a default list. `create` opens it as a tab and makes it
    // active, which the subscription above turns into an `open`.
    await lists.create();
    return;
  }

  // Restore the persisted tabs (dropping any lists that vanished) and the active
  // one, falling back to the first tab. A persisted "no list open" (active null,
  // no tabs) is honoured - the bar and view start empty.
  const openIds = lists.openIds.filter((id) => available.some((l) => l.id === id));
  const persisted = lists.activeId;
  const active =
    persisted && available.some((l) => l.id === persisted) ? persisted : (openIds[0] ?? null);
  // The active list is always one of the open tabs.
  const tabs = active && !openIds.includes(active) ? [...openIds, active] : openIds;

  useLists.setState({ openIds: tabs, activeId: active });
  if (active) await useTodos.getState().open(active);
  else useTodos.getState().closeList();
}

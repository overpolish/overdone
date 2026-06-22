/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** The media-folder id for a list's scratchpad attachments
 * (`lists/scratchpad-<listId>/media/…`). Kept separate from the list's own media
 * (`lists/<listId>/media`), and the `scratchpad-` prefix can't collide with a
 * list's UUID folder. */
export function scratchpadMediaId(listId: string): string {
  return `scratchpad-${listId}`;
}

/**
 * The freeform quick-notes scratchpad's content, one note per list (keyed by list
 * id), persisted to localStorage so jottings survive restarts. Each value is
 * canonical stored HTML (attachment srcs as portable `media/<file>` refs); the
 * editor rewrites to/from display URLs. The scratchpad has its own OS window, so
 * its size/position are remembered by the window-state plugin, not here.
 */
export interface ScratchpadState {
  /** Note HTML keyed by list id. */
  texts: Record<string, string>;
  setText: (listId: string, text: string) => void;
}

const STORAGE_NAME = "overdone-scratchpad";
const ACTIVE_KEY = "overdone-active-list";
const RECTS_KEY = "overdone-scratchpad-rects";

/** This list's note, or "" when it has none yet. */
export function scratchpadText(listId: string | null): string {
  return (listId && useScratchpad.getState().texts[listId]) || "";
}

/** The scratchpad window's remembered geometry for one list (physical pixels:
 * outer top-left + inner size), so each list reopens its scratchpad where it
 * last sat. Stored as a `{ [listId]: rect }` map in localStorage (the scratchpad
 * window is the sole reader/writer, so no cross-window sync is needed). */
export interface ScratchpadRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function isRect(r: unknown): r is ScratchpadRect {
  return (
    !!r &&
    typeof r === "object" &&
    ["x", "y", "w", "h"].every((k) => typeof (r as Record<string, unknown>)[k] === "number")
  );
}

/** This list's saved scratchpad geometry, or null when it has none yet. */
export function loadScratchpadRect(listId: string): ScratchpadRect | null {
  try {
    const map = JSON.parse(localStorage.getItem(RECTS_KEY) ?? "{}");
    const rect = map?.[listId];
    return isRect(rect) ? rect : null;
  } catch {
    return null;
  }
}

/** Remember this list's scratchpad geometry (merged into the per-list map). */
export function saveScratchpadRect(listId: string, rect: ScratchpadRect): void {
  try {
    const map = JSON.parse(localStorage.getItem(RECTS_KEY) ?? "{}");
    map[listId] = rect;
    localStorage.setItem(RECTS_KEY, JSON.stringify(map));
  } catch {
    // ignore (private-mode / disabled storage)
  }
}

export const useScratchpad = create<ScratchpadState>()(
  persist(
    (set) => ({
      texts: {},
      setText: (listId, text) =>
        set((s) => ({ texts: { ...s.texts, [listId]: text } })),
    }),
    {
      name: STORAGE_NAME,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // v0 held a single global `text`. Carry it onto whichever list was active
      // at upgrade time so the existing note isn't lost (legacy embedded media,
      // which lived in the old shared folder, won't resolve under the new
      // per-list folder - but plain-text notes migrate cleanly).
      migrate: (persisted, version) => {
        if (version === 0 && persisted && typeof persisted === "object") {
          const legacy = (persisted as { text?: string }).text ?? "";
          let activeId: string | null = null;
          try {
            activeId = localStorage.getItem(ACTIVE_KEY);
          } catch {
            activeId = null;
          }
          return { texts: legacy && activeId ? { [activeId]: legacy } : {} };
        }
        return persisted as ScratchpadState;
      },
    },
  ),
);

/** Show the scratchpad window (a persistent, resizable notes pad in its own
 * window, so it coexists with the popover panel). */
export function openScratchpad() {
  void invoke("show_scratchpad");
}

/** Hide the scratchpad window (its close button). */
export function closeScratchpad() {
  void invoke("hide_scratchpad");
}

/**
 * A note converted into a list item, sent from the scratchpad window to the main
 * window (which owns the active list, its media folder, and autosave). The first
 * selected line becomes the item; any remaining lines and embedded media become
 * its first comment.
 */
export interface ScratchpadConvert {
  /** The item's text (the selection's first line). */
  text: string;
  /** Stored HTML for the item's first comment (the rest of the selection), if
   * the selection had more than a single line of plain text. */
  comment?: string;
  /** Attachment filenames referenced by `comment`, to copy into the list. */
  mediaFiles: string[];
  /** Absolute path of the scratchpad's media folder, the copy source. */
  mediaDir: string;
}

export function emitScratchpadConvert(payload: ScratchpadConvert) {
  void emit("scratchpad:convert", payload);
}

/**
 * The lines a chunk of selected text would become: each trimmed, blank lines
 * dropped. Used to detect a multi-line selection and to take its first line.
 */
export function scratchpadLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

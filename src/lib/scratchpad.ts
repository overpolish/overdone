/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Reserved media-folder id for scratchpad attachments (`media/scratchpad/…`).
 * Real lists use UUIDs, so this can't collide with one. */
export const SCRATCHPAD_MEDIA_ID = "scratchpad";

/**
 * The freeform quick-notes scratchpad's content, persisted to localStorage so
 * jottings survive restarts. `text` is canonical stored HTML (attachment srcs as
 * portable `media/<file>` refs); the editor rewrites to/from display URLs. The
 * scratchpad has its own OS window, so its size/position are remembered by the
 * window-state plugin, not here.
 */
export interface ScratchpadState {
  text: string;
  setText: (text: string) => void;
}

const STORAGE_NAME = "overdone-scratchpad";

export const useScratchpad = create<ScratchpadState>()(
  persist(
    (set) => ({
      text: "",
      setText: (text) => set({ text }),
    }),
    {
      name: STORAGE_NAME,
      storage: createJSONStorage(() => localStorage),
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

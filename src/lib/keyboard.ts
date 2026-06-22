/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { useEffect } from "react";

import { openFilterPanel, openListsPanel, openSearchPanel, openSettingsPanel } from "./panel";
import { useTodos } from "./todos";

/** Whether focus is currently in a text field (input/textarea/contenteditable). */
function isEditableFocused() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/**
 * Global keyboard handling. Shortcuts (Cmd/Ctrl+Z / Shift / Y) take priority;
 * otherwise, typing a printable character while no field is focused starts a new
 * item at the top, seeded with that character.
 */
export function useGlobalKeyboard() {
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
        } else if (key === "f") {
          e.preventDefault();
          // Shift opens the filter panel; plain ⌘/Ctrl+F is search.
          if (e.shiftKey) openFilterPanel();
          else openSearchPanel();
        } else if (key === "l") {
          e.preventDefault();
          openListsPanel();
        } else if (key === ",") {
          e.preventDefault();
          openSettingsPanel();
        } else if (key === "n") {
          e.preventDefault();
          useTodos.getState().addItem();
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
}

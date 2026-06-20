/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { create } from "zustand";

import { type PanelRequest, setPanelDirty, setPanelEditing } from "./panel";

/** What a parked dismissal should do once the unsaved-changes prompt resolves:
 * close the panel, or swap it to a freshly requested view. */
export type PanelAction = { type: "close" } | { type: "open"; request: PanelRequest };

/** An editor's unsaved state plus how to commit or throw it away. The active
 * details view registers one for its composer, and the open inline-edit (if any)
 * registers another, so the prompt can act on whichever is dirty. */
export interface DraftSource {
  dirty: boolean;
  save: () => void;
  discard: () => void;
}

const EMPTY: DraftSource = { dirty: false, save: () => {}, discard: () => {} };

interface PanelGuardStore {
  /** The new-comment composer's draft (always present while details is open). */
  composer: DraftSource;
  /** The open inline comment edit's draft, or null when none is being edited. */
  inline: DraftSource | null;
  /** Whether a comment editor in the panel has focus (drives the drag grip). */
  editing: boolean;
  /** A dismissal parked behind the unsaved-changes prompt; null = no prompt. */
  pending: PanelAction | null;

  setComposer: (source: DraftSource) => void;
  setInline: (source: DraftSource | null) => void;
  /** Report editor focus (drives the drag grip). The backend keep-open hold it
   * feeds is applied only while the focused editor has draft content. */
  setEditing: (value: boolean) => void;
  /** Funnel a close/swap through the guard. Returns true if it was parked behind
   * the prompt (the caller must not proceed); false if it's safe to proceed. */
  request: (action: PanelAction) => boolean;
  /** Commit / throw away every dirty draft (the prompt's two destructive paths). */
  save: () => void;
  discard: () => void;
  clearPending: () => void;
  /** Reset on panel close. */
  reset: () => void;
}

// A specific next item supersedes a bare close (you picked where to go); a close
// never downgrades a parked swap.
function merge(prev: PanelAction | null, next: PanelAction): PanelAction {
  if (next.type === "open") return next;
  return prev ?? next;
}

function anyDirty(s: { composer: DraftSource; inline: DraftSource | null }): boolean {
  return s.composer.dirty || (s.inline?.dirty ?? false);
}

export const usePanelGuard = create<PanelGuardStore>((set, get) => {
  // The last values mirrored to the backend, each pushed only on a real change.
  let lastDirty = false;
  let lastEditing = false;
  const syncBackend = () => {
    const dirty = anyDirty(get());
    if (dirty !== lastDirty) {
      lastDirty = dirty;
      setPanelDirty(dirty);
    }
    // The "editing" hold (survive an app switch) only applies once the focused
    // editor actually has content. Focusing an empty composer and clicking away
    // should dismiss the panel like any other blur - the hold is for not losing
    // something you've started, so gate it on there being a draft to lose.
    const editing = get().editing && dirty;
    if (editing !== lastEditing) {
      lastEditing = editing;
      setPanelEditing(editing);
    }
  };

  return {
    composer: EMPTY,
    inline: null,
    editing: false,
    pending: null,

    setComposer: (composer) => {
      set({ composer });
      syncBackend();
    },
    setInline: (inline) => {
      set({ inline });
      syncBackend();
    },
    setEditing: (value) => {
      if (get().editing === value) return;
      set({ editing: value });
      // Recompute the backend hold (gated on draft content), not a raw focus push.
      syncBackend();
    },
    request: (action) => {
      if (!anyDirty(get())) return false;
      set((s) => ({ pending: merge(s.pending, action) }));
      return true;
    },
    save: () => {
      const { composer, inline } = get();
      if (composer.dirty) composer.save();
      if (inline?.dirty) inline.save();
    },
    discard: () => {
      const { composer, inline } = get();
      composer.discard();
      inline?.discard();
    },
    clearPending: () => set({ pending: null }),
    reset: () => {
      set({ composer: EMPTY, inline: null, pending: null });
      syncBackend();
    },
  };
});

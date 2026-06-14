/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { create } from "zustand";

/** Open state for the per-item right-click context menu (main window). */
interface ItemMenuState {
  open: { id: string; x: number; y: number } | null;
  show: (id: string, x: number, y: number) => void;
  hide: () => void;
}

export const useItemMenu = create<ItemMenuState>((set) => ({
  open: null,
  show: (id, x, y) => set({ open: { id, x, y } }),
  hide: () => set({ open: null }),
}));

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { create } from "zustand";

/** Request to open the diagram modal. `onSave` (when given alongside `editable`)
 * persists edited source back wherever the diagram lives. */
export interface OpenDiagram {
  code: string;
  editable?: boolean;
  initialMode?: "view" | "edit";
  onSave?: (code: string) => void;
}

// A global store (not React context) so TipTap node views - which render in a
// separate portal - can open the modal without relying on context propagation.
interface DiagramStore {
  req: OpenDiagram | null;
  openId: number;
  open: (req: OpenDiagram) => void;
  close: () => void;
}

export const useDiagramStore = create<DiagramStore>((set) => ({
  req: null,
  openId: 0,
  open: (req) => set((s) => ({ req, openId: s.openId + 1 })),
  close: () => set({ req: null }),
}));

/** Open the shared diagram modal (zoom/pan + split-pane editor). */
export const useDiagramEditor = () => useDiagramStore((s) => s.open);

/** Whether the diagram modal is currently open (drives the panel-window grow). */
export const useDiagramModalOpen = () => useDiagramStore((s) => s.req !== null);

/** Close the diagram modal imperatively (e.g. when the panel itself dismisses). */
export const closeDiagramModal = () => useDiagramStore.getState().close();

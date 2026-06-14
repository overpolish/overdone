/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { IconCheck, IconClock, IconProgress, IconX } from "@tabler/icons-react";

/** The lifecycle states a todo item can be in. `todo` is the default. */
export type TodoState = "todo" | "inProgress" | "onHold" | "done" | "cancelled";

export interface TodoStateMeta {
  value: TodoState;
  label: string;
  /**
   * Mantine color name driving the filled checkbox surface, or `null` for the
   * neutral `todo` state which reuses the plain (outlined) checkbox look.
   */
  color: string | null;
  /** Glyph rendered inside the checkbox; `null` leaves the box empty. */
  icon: typeof IconCheck | null;
  /**
   * Optical vertical nudge for the glyph, as a fraction of the box size
   * (negative = up). The clock is geometrically centered but its visible mass
   * sits low-right (hand at ~4–5 o'clock, empty top-left), so it reads low at
   * the small dropdown size. Only applied there (see StateBox `optical`).
   */
  iconNudgeY?: number;
}

/** Ordered for display in the status popover. */
export const TODO_STATES: TodoStateMeta[] = [
  { value: "todo", label: "Todo", color: null, icon: null },
  { value: "inProgress", label: "In progress", color: "blue", icon: IconProgress },
  { value: "onHold", label: "On hold", color: "amber", icon: IconClock, iconNudgeY: -0.03 },
  { value: "done", label: "Done", color: "green", icon: IconCheck },
  { value: "cancelled", label: "Cancelled", color: "gray", icon: IconX },
];

export const todoStateMeta = (state: TodoState): TodoStateMeta =>
  TODO_STATES.find((s) => s.value === state) ?? TODO_STATES[0];

/**
 * Terminal states that read as "no longer active" — rendered struck-through
 * and dimmed in lists. Both completing and abandoning an item retire it.
 */
export const isStruck = (state: TodoState): boolean =>
  state === "done" || state === "cancelled";

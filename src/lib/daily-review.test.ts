/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { describe, expect, it } from "vitest";

import { getReviewQueue, reviewReasons } from "./daily-review";
import { type TodoState } from "./todo";
import { type TodoData } from "./todos";

// Fixed "now": Mon 15 Jun 2026, 10:00 local.
const NOW = new Date(2026, 5, 15, 10, 0, 0).getTime();

/** Local epoch ms for a Y/M/D (+ optional time). */
const at = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

/** Date-only (local midnight) epoch, matching how due dates are stored. */
const due = (y: number, mo: number, d: number) => new Date(y, mo - 1, d).getTime();

let seq = 0;
const item = (over: Partial<TodoData> = {}): TodoData => ({
  id: `i-${seq++}`,
  text: "Task",
  state: "todo" as TodoState,
  depth: 0,
  ...over,
});

describe("reviewReasons", () => {
  it("flags an overdue item", () => {
    expect(reviewReasons(item({ dueDate: due(2026, 6, 14) }), NOW)).toEqual(["overdue"]);
  });

  it("flags a due-today item", () => {
    expect(reviewReasons(item({ dueDate: due(2026, 6, 15) }), NOW)).toEqual(["today"]);
  });

  it("ignores a future due date", () => {
    expect(reviewReasons(item({ dueDate: due(2026, 6, 16) }), NOW)).toEqual([]);
  });

  it("flags a fired, unacknowledged reminder", () => {
    expect(reviewReasons(item({ notifiedAt: at(2026, 6, 15, 9) }), NOW)).toEqual(["fired"]);
  });

  it("flags an in-progress item untouched past the stale threshold", () => {
    const stale = item({ state: "inProgress", updatedAt: at(2026, 6, 12) });
    expect(reviewReasons(stale, NOW, 3)).toEqual(["stale"]);
  });

  it("does not flag active work edited within the threshold", () => {
    const fresh = item({ state: "inProgress", updatedAt: at(2026, 6, 14) });
    expect(reviewReasons(fresh, NOW, 3)).toEqual([]);
  });

  it("does not flag a plain todo for staleness (only active work)", () => {
    expect(reviewReasons(item({ state: "todo", updatedAt: at(2026, 1, 1) }), NOW)).toEqual([]);
  });

  it("never flags a resolved item, whatever its dates", () => {
    const done = item({ state: "done", dueDate: due(2026, 6, 1), notifiedAt: at(2026, 6, 1) });
    expect(reviewReasons(done, NOW)).toEqual([]);
    expect(reviewReasons({ ...done, state: "cancelled" }, NOW)).toEqual([]);
  });

  it("collects multiple reasons, most-urgent first", () => {
    const both = item({
      state: "onHold",
      dueDate: due(2026, 6, 14),
      notifiedAt: at(2026, 6, 15, 9),
      updatedAt: at(2026, 6, 1),
    });
    expect(reviewReasons(both, NOW, 3)).toEqual(["overdue", "fired", "stale"]);
  });
});

describe("getReviewQueue", () => {
  it("includes only qualifying items", () => {
    const items = [
      item({ dueDate: due(2026, 6, 14) }), // overdue
      item({ dueDate: due(2026, 6, 30) }), // future - excluded
      item({ state: "done", dueDate: due(2026, 6, 1) }), // resolved - excluded
    ];
    const q = getReviewQueue(items, NOW);
    expect(q.map((e) => e.item.id)).toEqual([items[0].id]);
  });

  it("orders by leading reason: overdue → fired → today → stale", () => {
    const stale = item({ state: "inProgress", updatedAt: at(2026, 6, 1) });
    const today = item({ dueDate: due(2026, 6, 15) });
    const fired = item({ notifiedAt: at(2026, 6, 15, 9) });
    const overdue = item({ dueDate: due(2026, 6, 10) });
    const q = getReviewQueue([stale, today, fired, overdue], NOW, 3);
    expect(q.map((e) => e.item.id)).toEqual([overdue.id, fired.id, today.id, stale.id]);
  });

  it("keeps list order for items sharing a leading reason", () => {
    const a = item({ dueDate: due(2026, 6, 10) });
    const b = item({ dueDate: due(2026, 6, 11) });
    const q = getReviewQueue([a, b], NOW);
    expect(q.map((e) => e.item.id)).toEqual([a.id, b.id]);
  });
});

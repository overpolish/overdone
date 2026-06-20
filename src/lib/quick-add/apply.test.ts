/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { beforeEach, describe, expect, it } from "vitest";

import { useTodos } from "../todos";
import { type TodoData } from "../todos";
import { datesFromNewComments, parseQuickAdd } from "./parse";

/** Reset the store to a single known item before each test. */
function seed(item: Partial<TodoData> = {}): string {
  const id = "item-1";
  useTodos.setState({
    items: [{ id, text: "", state: "todo", depth: 0, ...item }],
    assignees: [],
    labels: [],
    past: [],
    future: [],
    lastKey: null,
  });
  return id;
}

const item = () => useTodos.getState().items[0];

describe("applyQuickAdd (store integration)", () => {
  beforeEach(() => seed());

  it("mints new label/assignee, sets dates, and cleans the text", () => {
    const id = seed({ text: "Fix login #bug @john due friday" });
    const parsed = parseQuickAdd(
      "Fix login #bug @john due friday",
      [],
      [],
      new Date(2026, 5, 15, 10, 0, 0),
    );
    useTodos.getState().applyQuickAdd(id, parsed);

    const s = useTodos.getState();
    expect(item().text).toBe("Fix login");
    expect(s.labels.map((l) => l.name)).toEqual(["bug"]);
    expect(s.assignees.map((a) => a.name)).toEqual(["john"]);
    expect(item().labels).toEqual([s.labels[0].id]);
    expect(item().assignees).toEqual([s.assignees[0].id]);
    expect(item().dueDate).toBe(new Date(2026, 5, 19).getTime());
  });

  it("merges onto existing assignees/labels rather than replacing", () => {
    const id = seed({ text: "x @bob", assignees: ["existing"], labels: ["lab"] });
    useTodos.setState({ assignees: [{ id: "existing", name: "Ann", color: "#111" }] });
    const parsed = parseQuickAdd("x @bob", useTodos.getState().assignees, []);
    useTodos.getState().applyQuickAdd(id, parsed);

    // Keeps the prior assignee and appends the new one; prior label is untouched.
    expect(item().assignees).toContain("existing");
    expect(item().assignees?.length).toBe(2);
    expect(item().labels).toEqual(["lab"]);
  });

  it("does not clear an existing date when the parse found none", () => {
    const id = seed({ text: "Plain edit", dueDate: 999 });
    const parsed = parseQuickAdd("Plain edit", [], []);
    useTodos.getState().applyQuickAdd(id, parsed);
    expect(item().dueDate).toBe(999);
  });

  it("collapses into a single undo step (coalesced with the text edit)", () => {
    const id = seed();
    // Simulate the type-then-blur flow: text edits coalesce under text:<id>.
    useTodos.getState().setItemText(id, "Fix login #bug");
    const parsed = parseQuickAdd("Fix login #bug", [], []);
    useTodos.getState().applyQuickAdd(id, parsed);

    expect(item().text).toBe("Fix login");
    expect(item().labels?.length).toBe(1);

    // One undo returns to before the run of edits - not an intermediate snapshot
    // with the raw "#bug" token in the text.
    useTodos.getState().undo();
    expect(item().text).toBe("");
    expect(item().labels ?? []).toEqual([]);
  });
});

describe("datesFromNewComments (comment wiring)", () => {
  const REF = new Date(2026, 5, 15, 10, 0, 0);
  const plain = (s: string) => s; // identity stand-in for htmlToText

  it("derives a reminder from a freshly added comment", () => {
    const dates = datesFromNewComments(
      new Map(),
      [{ id: "c1", text: "remind me tomorrow at 15:00" }],
      plain,
      REF,
    );
    expect(dates.notifyAt).toBe(new Date(2026, 5, 16, 15, 0).getTime());
  });

  it("carries the comment text minus the date phrase as the reminder body", () => {
    const dates = datesFromNewComments(
      new Map(),
      [{ id: "c1", text: "  Testing tomorrow at 15:00  " }],
      plain,
      REF,
    );
    expect(dates.notifyMessage).toBe("Testing");
  });

  it("reads '@' as 'at': fuses the day and time, leaving a clean body", () => {
    const dates = datesFromNewComments(
      new Map(),
      [{ id: "c1", text: "testing tomorrow @15:30" }],
      plain,
      REF,
    );
    expect(dates.notifyAt).toBe(new Date(2026, 5, 16, 15, 30).getTime());
    expect(dates.dueDate).toBeUndefined();
    expect(dates.notifyMessage).toBe("testing");
  });

  it("leaves the reminder body unset when the comment is only a date phrase", () => {
    const dates = datesFromNewComments(
      new Map(),
      [{ id: "c1", text: "tomorrow at 15:00" }],
      plain,
      REF,
    );
    expect(dates.notifyAt).toBe(new Date(2026, 5, 16, 15, 0).getTime());
    expect(dates.notifyMessage).toBeUndefined();
  });

  it("leaves the reminder body unset for a due-only comment", () => {
    const dates = datesFromNewComments(
      new Map(),
      [{ id: "c1", text: "finish the report eod" }],
      plain,
      REF,
    );
    expect(dates.notifyMessage).toBeUndefined();
  });

  it("ignores comments that are unchanged from before", () => {
    const prev = new Map([["c1", "due tomorrow"]]);
    const dates = datesFromNewComments(prev, [{ id: "c1", text: "due tomorrow" }], plain, REF);
    expect(dates).toEqual({});
  });

  it("scans only the edited comment, not the old ones", () => {
    const prev = new Map([["c1", "old note"]]);
    const dates = datesFromNewComments(
      prev,
      [
        { id: "c1", text: "old note" }, // unchanged
        { id: "c2", text: "finish the report eod" }, // new
      ],
      plain,
      REF,
    );
    expect(dates.dueDate).toBe(new Date(2026, 5, 15).getTime());
  });
});

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { describe, expect, it } from "vitest";

import { type Assignee, type Label } from "../todos";
import { parseDates, parseQuickAdd } from "./parse";

// A fixed "now" so date assertions are stable: Mon 15 Jun 2026, 10:00 local.
const REF = new Date(2026, 5, 15, 10, 0, 0);

const roster: Assignee[] = [
  { id: "a-john", name: "John Smith", color: "#111111" },
  { id: "a-jane", name: "Jane Doe", color: "#222222" },
];
const labels: Label[] = [
  { id: "l-bug", name: "bug", color: "#333333" },
  { id: "l-feature", name: "feature", color: "#444444" },
  { id: "l-marketing", name: "marketing", color: "#555555" },
];

const parse = (text: string) => parseQuickAdd(text, roster, labels, REF);

/** Local epoch ms for a Y/M/D (+ optional time), matching the parser's clock. */
const at = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

describe("labels", () => {
  it("creates a new label from #tag and strips it", () => {
    const r = parse("Fix login #regression");
    expect(r.text).toBe("Fix login");
    expect(r.newLabels).toEqual(["regression"]);
    expect(r.labelIds).toEqual([]);
    expect(r.changed).toBe(true);
  });

  it("resolves an existing label to its id (case-insensitive)", () => {
    const r = parse("Crash on save #BUG");
    expect(r.text).toBe("Crash on save");
    expect(r.labelIds).toEqual(["l-bug"]);
    expect(r.newLabels).toEqual([]);
  });

  it("leaves a mid-word # alone (C# is not a tag)", () => {
    const r = parse("Rewrite in C# soon");
    expect(r.text).toBe("Rewrite in C# soon");
    expect(r.changed).toBe(false);
  });

  it("auto-corrects a plural #features to the existing 'feature' label", () => {
    const r = parse("Ship dark mode #features");
    expect(r.text).toBe("Ship dark mode");
    expect(r.labelIds).toEqual(["l-feature"]);
    expect(r.newLabels).toEqual([]);
  });

  it("stem-matches #mark to the existing 'marketing' label", () => {
    const r = parse("Launch email #mark");
    expect(r.text).toBe("Launch email");
    expect(r.labelIds).toEqual(["l-marketing"]);
    expect(r.newLabels).toEqual([]);
  });

  it("creates a new label when nothing stems/matches (#chore)", () => {
    const r = parse("Tidy the repo #chore");
    expect(r.text).toBe("Tidy the repo");
    expect(r.labelIds).toEqual([]);
    expect(r.newLabels).toEqual(["chore"]);
  });
});

describe("assignees", () => {
  it("creates a new person from @name", () => {
    const r = parse("Review PR @bob");
    expect(r.text).toBe("Review PR");
    expect(r.newAssignees).toEqual(["bob"]);
  });

  it("resolves an existing person to their id", () => {
    const r = parse("Review PR @john");
    expect(r.text).toBe("Review PR");
    expect(r.assigneeIds).toEqual(["a-john"]);
    expect(r.newAssignees).toEqual([]);
  });

  it("handles the 'assign to NAME to TASK' directive", () => {
    const r = parse("Assign to john to investigate some task");
    expect(r.text).toBe("investigate some task");
    expect(r.assigneeIds).toEqual(["a-john"]);
  });

  it("splits multiple names in a directive", () => {
    const r = parse("assign to john and sara to ship the build");
    expect(r.text).toBe("ship the build");
    expect(r.assigneeIds).toEqual(["a-john"]);
    expect(r.newAssignees).toEqual(["sara"]);
  });

  it("ignores a stray @ not followed by a name", () => {
    const r = parse("ping me @ the office");
    expect(r.newAssignees).toEqual([]);
    expect(r.assigneeIds).toEqual([]);
  });

  it("fuzzy-matches a first name to a full roster name", () => {
    const r = parse("Review PR @john");
    expect(r.assigneeIds).toEqual(["a-john"]); // "John Smith"
    expect(r.newAssignees).toEqual([]);
  });

  it("tolerates a typo in the assignment verb (assignt -> assign)", () => {
    const r = parse("Review PR assignt to john");
    expect(r.text).toBe("Review PR");
    expect(r.assigneeIds).toEqual(["a-john"]);
    expect(r.newAssignees).toEqual([]);
  });

  it("handles bare 'assign john' when the person already exists", () => {
    const r = parse("Review PR assign john");
    expect(r.text).toBe("Review PR");
    expect(r.assigneeIds).toEqual(["a-john"]);
    expect(r.newAssignees).toEqual([]);
  });

  it("does NOT mint a person from a bare imperative (assign tickets to triage)", () => {
    const r = parse("assign tickets to triage");
    expect(r.assigneeIds).toEqual([]);
    expect(r.newAssignees).toEqual([]);
    expect(r.changed).toBe(false);
    expect(r.text).toBe("assign tickets to triage");
  });

  it("does NOT create a new person from a bare 'assign NAME' (needs 'to')", () => {
    const r = parse("Ship it assign mike");
    expect(r.assigneeIds).toEqual([]);
    expect(r.newAssignees).toEqual([]);
    expect(r.text).toBe("Ship it assign mike");
  });

  it("creates a new person when 'to' is explicit (assign to bob)", () => {
    const r = parse("Draft spec assign to bob");
    expect(r.text).toBe("Draft spec");
    expect(r.newAssignees).toEqual(["bob"]);
    expect(r.assigneeIds).toEqual([]);
  });

  it("leaves a non-assign 'X to Y' phrase alone (talk to john)", () => {
    const r = parse("Need to talk to john about specs");
    expect(r.assigneeIds).toEqual([]);
    expect(r.newAssignees).toEqual([]);
    expect(r.text).toBe("Need to talk to john about specs");
  });

  it("handles 'ask NAME to TASK' (title becomes the task)", () => {
    const r = parse("ask john to review the deck");
    expect(r.text).toBe("review the deck");
    expect(r.assigneeIds).toEqual(["a-john"]);
  });

  it("handles 'get NAME to TASK'", () => {
    const r = parse("get jane to ship it");
    expect(r.text).toBe("ship it");
    expect(r.assigneeIds).toEqual(["a-jane"]);
  });

  it("does NOT trigger on 'get milk' (no name, no task)", () => {
    const r = parse("get milk");
    expect(r.changed).toBe(false);
    expect(r.text).toBe("get milk");
  });

  it("handles 'delegate to NAME' (may create)", () => {
    const r = parse("Draft spec delegate to bob");
    expect(r.text).toBe("Draft spec");
    expect(r.newAssignees).toEqual(["bob"]);
  });

  it("handles 'owner: NAME' trailing (marker allows create)", () => {
    const r = parse("Build pipeline owner: dana");
    expect(r.text).toBe("Build pipeline");
    expect(r.newAssignees).toEqual(["dana"]);
  });

  it("handles 'owned by NAME'", () => {
    const r = parse("Quarterly report owned by jane");
    expect(r.text).toBe("Quarterly report");
    expect(r.assigneeIds).toEqual(["a-jane"]);
  });

  it("does NOT trigger on a bare 'owner' with no marker and no match", () => {
    const r = parse("update owner field");
    expect(r.changed).toBe(false);
    expect(r.text).toBe("update owner field");
  });

  it("matches a directive name against an existing person, not a new one", () => {
    const r = parse("daily review - like yahoo catchup, asks for comment/status? assign to john");
    expect(r.text).toBe("daily review - like yahoo catchup, asks for comment/status?");
    expect(r.assigneeIds).toEqual(["a-john"]);
    expect(r.newAssignees).toEqual([]);
  });

  it("tolerates a typo via edit distance", () => {
    const r = parse("Review PR @jon");
    expect(r.assigneeIds).toEqual(["a-john"]);
  });

  it("does not over-merge a clearly different name", () => {
    const r = parse("Review PR @johnny");
    expect(r.assigneeIds).toEqual([]);
    expect(r.newAssignees).toEqual(["johnny"]);
  });
});

describe("dates", () => {
  it("sets a due date from 'due WEEKDAY' and strips the cue", () => {
    const r = parse("Fix login due friday");
    expect(r.text).toBe("Fix login");
    expect(r.dueDate).toBe(at(2026, 6, 19)); // the coming Friday, midnight
    expect(r.notifyAt).toBeUndefined();
  });

  it("sets a reminder from 'follow up tomorrow at 15:00', keeping the verb", () => {
    const r = parse("Follow up tomorrow at 15:00");
    expect(r.text).toBe("Follow up");
    expect(r.notifyAt).toBe(at(2026, 6, 16, 15, 0));
    expect(r.dueDate).toBeUndefined();
  });

  it("defaults a reminder with no clock time to 9am", () => {
    const r = parse("remind me tomorrow");
    expect(r.notifyAt).toBe(at(2026, 6, 16, 9, 0));
  });

  it("treats a bare weekday in prose as text, not a date", () => {
    const r = parse("Prep the monday meeting deck");
    expect(r.dueDate).toBeUndefined();
    expect(r.notifyAt).toBeUndefined();
    expect(r.text).toBe("Prep the monday meeting deck");
  });

  it("takes a strong date with no cue (tomorrow)", () => {
    const r = parse("Ship the release tomorrow");
    expect(r.dueDate).toBe(at(2026, 6, 16));
    expect(r.text).toBe("Ship the release");
  });

  // REF is Mon 15 Jun 2026, so: Wed=17, Fri=19, Sat=20, month end=30.
  it("resolves 'eod' to today", () => {
    const r = parse("Ship it eod");
    expect(r.dueDate).toBe(at(2026, 6, 15));
    expect(r.text).toBe("Ship it");
  });

  it("resolves 'eow' to the coming Friday", () => {
    expect(parse("Deliverable eow").dueDate).toBe(at(2026, 6, 19));
  });

  it("resolves 'this weekend' to Saturday", () => {
    expect(parse("Plan trip this weekend").dueDate).toBe(at(2026, 6, 20));
  });

  it("resolves 'end of month'", () => {
    expect(parse("Invoices end of month").dueDate).toBe(at(2026, 6, 30));
  });

  it("resolves 'mid-week' to Wednesday", () => {
    expect(parse("Sync mid-week").dueDate).toBe(at(2026, 6, 17));
  });

  it("routes 'notify eod' to a reminder (not a due date)", () => {
    const r = parse("Wrap up notify eod");
    expect(r.notifyAt).toBe(at(2026, 6, 15, 18, 0)); // end-of-day reminder
    expect(r.dueDate).toBeUndefined();
    expect(r.text).toBe("Wrap up");
  });

  it("routes 'remind me eow' to a reminder at the default hour", () => {
    const r = parse("Check in remind me eow");
    expect(r.notifyAt).toBe(at(2026, 6, 19, 9, 0));
    expect(r.dueDate).toBeUndefined();
  });

  it("still treats a bare 'eod' as a due date", () => {
    const r = parse("Ship it eod");
    expect(r.dueDate).toBe(at(2026, 6, 15));
    expect(r.notifyAt).toBeUndefined();
  });

  it("clamps a reminder whose injected time is already past (remind me today)", () => {
    // REF is 10:00; "today" gets the 9am default hour, which has passed -> clamp.
    const r = parse("remind me today");
    expect(r.notifyAt).toBe(REF.getTime());
  });
});

describe("parseDates (comments - text kept, dates only)", () => {
  const at = (y: number, mo: number, d: number, h = 0, mi = 0) =>
    new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

  it("sets a reminder from 'remind me tomorrow at 15:00'", () => {
    expect(parseDates("remind me tomorrow at 15:00", REF)).toEqual({
      notifyAt: at(2026, 6, 16, 15, 0),
    });
  });

  it("sets a due date from 'due tomorrow'", () => {
    expect(parseDates("due tomorrow", REF)).toEqual({ dueDate: at(2026, 6, 16) });
  });

  it("finds a date embedded in a longer comment", () => {
    const r = parseDates("Spoke to the vendor, will follow up tomorrow at 9am", REF);
    expect(r.notifyAt).toBe(at(2026, 6, 16, 9, 0));
  });

  it("returns nothing for a comment with no date cue", () => {
    expect(parseDates("Looks good, shipping it", REF)).toEqual({});
  });
});

describe("combinations", () => {
  it("pulls label, assignee, and due date from one line", () => {
    const r = parse("Fix login #bug @john due friday");
    expect(r.text).toBe("Fix login");
    expect(r.labelIds).toEqual(["l-bug"]);
    expect(r.assigneeIds).toEqual(["a-john"]);
    expect(r.dueDate).toBe(at(2026, 6, 19));
  });

  it("reports no change for plain text", () => {
    const r = parse("Just a normal task");
    expect(r.changed).toBe(false);
    expect(r.text).toBe("Just a normal task");
  });
});

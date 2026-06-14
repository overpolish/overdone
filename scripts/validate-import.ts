/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

/**
 * Validate `importMarkdown` against `renderMarkdown`: render a known list to the
 * human-readable export format, import it back, and assert the *recoverable*
 * content survives (text, state, comments, and assignee/label names - ids and
 * exact timestamps are knowingly lossy). Also checks a couple of plain
 * hand-written GitHub task lists. Run: `npx tsx scripts/validate-import.ts`.
 */

import { renderMarkdown } from "../src/lib/markdown/export";
import { importMarkdown } from "../src/lib/markdown/import";
import type { Assignee, Label, TodoData } from "../src/lib/todos";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

// --- A list exercising every export feature ----------------------------------
const assignees: Assignee[] = [
  { id: "a1", name: "Alice", color: "#aa1111" },
  { id: "a2", name: "Bob", color: "#1111aa" },
];
const labels: Label[] = [
  { id: "l1", name: "urgent", color: "#cc3300" },
  { id: "l2", name: "backend", color: "#0033cc" },
];
const doneAt = Date.parse("2026-06-13T14:05:00");
const c1 = Date.parse("2026-06-12T09:00:00");
const c2 = Date.parse("2026-06-12T11:30:00");

const items: TodoData[] = [
  { id: "1", text: "Plain todo", state: "todo", depth: 0 },
  {
    id: "2",
    text: "Ship the release",
    state: "done",
    depth: 0,
    doneAt,
    assignees: ["a1", "a2"],
    labels: ["l1", "l2"],
    comments: [
      { id: "c1", text: "kicked off", createdAt: c1 },
      { id: "c2", text: "still going\nsecond line", createdAt: c2, editedAt: c2 },
    ],
  },
  { id: "3", text: "Sub item", state: "todo", depth: 1 },
  { id: "4", text: "Halted work", state: "onHold", depth: 0, labels: ["l1"] },
  { id: "5", text: "Active work", state: "inProgress", depth: 0, assignees: ["a1"] },
  { id: "6", text: "Dropped idea", state: "cancelled", depth: 0 },
  { id: "7", text: "Line one\nline two", state: "todo", depth: 0 },
];

const md = renderMarkdown("Round trip", items, assignees, labels);
console.log("Rendered export:\n");
console.log(md.replace(/^/gm, "    "));

const back = importMarkdown(md);

console.log("Round-trip assertions:");
check("title preserved", back.title === "Round trip", back.title);
check("item count", back.items.length === items.length, `${back.items.length}`);

const byText = (t: string) => back.items.find((i) => i.text === t);
check("plain todo text + state", byText("Plain todo")?.state === "todo");

const ship = byText("Ship the release");
check("done state recovered", ship?.state === "done");
check("doneAt parsed", ship?.doneAt === doneAt, `${ship?.doneAt} vs ${doneAt}`);
const shipAssignees = (ship?.assignees ?? [])
  .map((id) => back.assignees.find((a) => a.id === id)?.name)
  .sort();
check("assignee names", JSON.stringify(shipAssignees) === JSON.stringify(["Alice", "Bob"]), shipAssignees.join(","));
const shipLabels = (ship?.labels ?? [])
  .map((id) => back.labels.find((l) => l.id === id)?.name)
  .sort();
check("label names", JSON.stringify(shipLabels) === JSON.stringify(["backend", "urgent"]), shipLabels.join(","));
check("comment count", ship?.comments?.length === 2, `${ship?.comments?.length}`);
check("comment text", ship?.comments?.[0]?.text === "kicked off", ship?.comments?.[0]?.text);
check("multiline comment text", ship?.comments?.[1]?.text === "still going\nsecond line", JSON.stringify(ship?.comments?.[1]?.text));
check("edited flag retained", ship?.comments?.[1]?.editedAt != null);

check("sub item depth", byText("Sub item")?.depth === 1);
check("on hold state", byText("Halted work")?.state === "onHold");
check("in progress state", byText("Active work")?.state === "inProgress");
check("cancelled state + clean text", byText("Dropped idea")?.state === "cancelled");
check("multiline item text", byText("Line one\nline two") != null);

check("roster deduped to 2 assignees", back.assignees.length === 2, `${back.assignees.length}`);
check("roster deduped to 2 labels", back.labels.length === 2, `${back.labels.length}`);
check("imported assignees have hex colors", back.assignees.every((a) => /^#[0-9a-f]{6}$/i.test(a.color)));

// --- Plain hand-written GitHub task list (no export sugar) --------------------
const plain = `# Groceries
- [ ] Milk
- [x] Eggs
  - [ ] free range
- [ ] Bread
`;
const plainBack = importMarkdown(plain);
console.log("\nPlain markdown assertions:");
check("plain title", plainBack.title === "Groceries");
check("plain item count", plainBack.items.length === 4, `${plainBack.items.length}`);
check("plain checked => done", plainBack.items.find((i) => i.text === "Eggs")?.state === "done");
check("plain unchecked => todo", plainBack.items.find((i) => i.text === "Milk")?.state === "todo");
check("plain nesting", plainBack.items.find((i) => i.text === "free range")?.depth === 1);
check("plain no phantom rosters", plainBack.assignees.length === 0 && plainBack.labels.length === 0);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

import { type TodoState } from "../todo";

/**
 * Markdown serialization for a list. A list file looks like:
 *
 *   # My list
 *
 *   - [ ] A todo
 *     - [ ] A sub-item
 *   - [-] Something on hold
 *   - [x] Something done
 *     with a second line of detail
 *
 * Todo and done use the standard GitHub task-list markers so the files stay
 * readable in any markdown viewer; on-hold uses `- [-]` and in-progress `- [/]`
 * (the Obsidian/Tasks conventions). Sub-items (one level only) are indented two
 * spaces. An item's text may span multiple lines: continuation lines are
 * indented two spaces past the item's marker and rejoined on parse.
 *
 * Per-item timestamps (created / last-updated / done) are tacked onto the end of
 * the item's first line as an HTML comment, e.g.
 *   - [x] Ship it <!-- created=2026-06-12T09:00:00.000Z done=2026-06-12T10:00:00.000Z -->
 * Comments are invisible in any rendered markdown view, so the files stay clean,
 * and they round-trip back into the item's metadata on parse.
 */

export const STATE_TO_MARKER: Record<TodoState, string> = {
  todo: " ",
  inProgress: "/",
  onHold: "-",
  done: "x",
  cancelled: "~",
};

export const MARKER_TO_STATE: Record<string, TodoState> = {
  " ": "todo",
  "": "todo",
  "/": "inProgress", // the Obsidian/Tasks in-progress convention
  "-": "onHold",
  x: "done",
  X: "done",
  "~": "cancelled",
};

/**
 * Matches a task line, capturing an optional two-space indent (= sub-item), the
 * marker, and the trailing text.
 */
export const ITEM_RE = /^( {2})?- \[(.?)\]\s?(.*)$/;

/** Trailing metadata comment on an item's first line. */
export const META_RE = /\s*<!--\s*(.*?)\s*-->\s*$/;

/** List-level metadata line (the assignee roster), placed under the title. */
export const ROSTER_RE = /^<!--\s*overdone:assignees=(.*?)\s*-->\s*$/;

/** The metadata keys carried in the comment, in serialization order. */
export const META_FIELDS = [
  ["created", "createdAt"],
  ["updated", "updatedAt"],
  ["done", "doneAt"],
  ["notify", "notifyAt"],
  ["notified", "notifiedAt"],
  ["due", "dueDate"],
] as const;

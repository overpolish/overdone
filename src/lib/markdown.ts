import { type Assignee, type TodoData } from "./todos";
import { type TodoState } from "./todo";

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

const STATE_TO_MARKER: Record<TodoState, string> = {
  todo: " ",
  inProgress: "/",
  onHold: "-",
  done: "x",
};

const MARKER_TO_STATE: Record<string, TodoState> = {
  " ": "todo",
  "": "todo",
  "/": "inProgress", // the Obsidian/Tasks in-progress convention
  "-": "onHold",
  x: "done",
  X: "done",
};

/**
 * Matches a task line, capturing an optional two-space indent (= sub-item), the
 * marker, and the trailing text.
 */
const ITEM_RE = /^( {2})?- \[(.?)\]\s?(.*)$/;

/** Trailing metadata comment on an item's first line. */
const META_RE = /\s*<!--\s*(.*?)\s*-->\s*$/;

/** List-level metadata line (the assignee roster), placed under the title. */
const ROSTER_RE = /^<!--\s*overdone:assignees=(.*?)\s*-->\s*$/;

/** The metadata keys carried in the comment, in serialization order. */
const META_FIELDS = [
  ["created", "createdAt"],
  ["updated", "updatedAt"],
  ["done", "doneAt"],
] as const;

export interface ParsedList {
  title: string;
  items: TodoData[];
  /** The list's assignee roster (empty if the file carries none). */
  assignees: Assignee[];
}

/** Build the trailing ` <!-- ... -->` comment for an item's metadata. */
function serializeMeta(item: TodoData): string {
  const parts: string[] = [];
  for (const [key, field] of META_FIELDS) {
    const value = item[field];
    if (value != null) parts.push(`${key}=${new Date(value).toISOString()}`);
  }
  // Assignee ids are UUIDs (no spaces/commas), so a plain comma-joined list is
  // safe within the space-separated key=value metadata.
  if (item.assignees?.length) {
    parts.push(`assignees=${item.assignees.join(",")}`);
  }
  // Comments are JSON, then URL-encoded so their spaces/newlines can't break
  // the space-separated key=value list (and they stay on the item's one line).
  if (item.comments?.length) {
    parts.push(`comments=${encodeURIComponent(JSON.stringify(item.comments))}`);
  }
  return parts.length ? ` <!-- ${parts.join(" ")} -->` : "";
}

/**
 * Pull a trailing metadata comment off an item's first-line text. Only strips
 * the comment when it actually carries a recognized key, so an unrelated HTML
 * comment in the text is left untouched.
 */
function parseMeta(text: string): { text: string; meta: Partial<TodoData> } {
  const m = text.match(META_RE);
  if (!m) return { text, meta: {} };
  const meta: Partial<TodoData> = {};
  for (const pair of m[1].split(/\s+/)) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    const raw = pair.slice(eq + 1);
    if (key === "comments") {
      try {
        const parsed = JSON.parse(decodeURIComponent(raw));
        if (Array.isArray(parsed)) meta.comments = parsed;
      } catch {
        // Malformed metadata: drop it rather than failing the whole parse.
      }
      continue;
    }
    if (key === "assignees") {
      const ids = raw.split(",").filter(Boolean);
      if (ids.length) meta.assignees = ids;
      continue;
    }
    if (key === "comment") {
      // Legacy single free-form comment → one entry in the new log.
      const text = decodeURIComponent(raw);
      if (text) meta.comments = [{ id: crypto.randomUUID(), text, createdAt: Date.now() }];
      continue;
    }
    const field = META_FIELDS.find(([k]) => k === key)?.[1];
    const t = Date.parse(raw);
    if (field && !Number.isNaN(t)) meta[field] = t;
  }
  if (Object.keys(meta).length === 0) return { text, meta: {} };
  return { text: text.slice(0, m.index), meta };
}

/** Build the markdown for a list. */
export function serializeList(
  title: string,
  items: TodoData[],
  assignees: Assignee[] = [],
): string {
  const lines: string[] = [`# ${title}`];
  // List-level roster, on its own line under the title (URL-encoded JSON so it
  // can't break the line). Invisible in any rendered markdown view.
  if (assignees.length) {
    lines.push(`<!-- overdone:assignees=${encodeURIComponent(JSON.stringify(assignees))} -->`);
  }
  lines.push("");
  for (const item of items) {
    const indent = item.depth === 1 ? "  " : "";
    const marker = STATE_TO_MARKER[item.state];
    const [first = "", ...rest] = item.text.split("\n");
    lines.push(`${indent}- [${marker}] ${first}${serializeMeta(item)}`);
    // Continuation lines sit two spaces past the marker so they read as part of
    // the item and parse back into the same multi-line text.
    for (const line of rest) lines.push(`${indent}  ${line}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Replace (or insert) the `# ` title heading in a list's markdown, leaving the
 * items untouched. Used to rename a list that isn't currently loaded, without
 * round-tripping its items through the parser.
 */
export function setMarkdownTitle(content: string, title: string): string {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith("# ") || l === "#");
  if (idx >= 0) {
    lines[idx] = `# ${title}`;
    return lines.join("\n");
  }
  return `# ${title}\n\n${content}`;
}

/** Parse a list's markdown back into a title and items. */
export function parseList(content: string): ParsedList {
  const lines = content.split(/\r?\n/);
  let title = "";
  let assignees: Assignee[] = [];
  const items: TodoData[] = [];

  for (const line of lines) {
    if (!title) {
      const heading = line.match(/^#\s+(.*)$/);
      if (heading) {
        title = heading[1].trim();
        continue;
      }
    }

    // List-level roster line (appears before any item, under the title).
    const roster = line.match(ROSTER_RE);
    if (roster) {
      try {
        const parsed = JSON.parse(decodeURIComponent(roster[1]));
        if (Array.isArray(parsed)) assignees = parsed;
      } catch {
        // Malformed roster: drop it rather than failing the whole parse.
      }
      continue;
    }

    const item = line.match(ITEM_RE);
    if (item) {
      const depth = item[1] ? 1 : 0;
      const state = MARKER_TO_STATE[item[2]] ?? "todo";
      const { text, meta } = parseMeta(item[3]);
      items.push({ id: crypto.randomUUID(), text, state, depth, ...meta });
      continue;
    }

    // A non-empty, non-item line that isn't the title is a continuation of the
    // previous item's text. Strip up to the item's continuation indent (marker
    // indent + 2): 4 spaces for a sub-item, 2 for a top item.
    if (items.length > 0 && line.trim() !== "") {
      const last = items[items.length - 1];
      const strip = last.depth === 1 ? 4 : 2;
      last.text += "\n" + line.replace(new RegExp(`^ {0,${strip}}`), "");
    }
  }

  return { title, items, assignees };
}

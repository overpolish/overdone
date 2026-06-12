import { type TodoData } from "./todos";
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

export interface ParsedList {
  title: string;
  items: TodoData[];
}

/** Build the markdown for a list. */
export function serializeList(title: string, items: TodoData[]): string {
  const lines: string[] = [`# ${title}`, ""];
  for (const item of items) {
    const indent = item.depth === 1 ? "  " : "";
    const marker = STATE_TO_MARKER[item.state];
    const [first = "", ...rest] = item.text.split("\n");
    lines.push(`${indent}- [${marker}] ${first}`);
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
  const items: TodoData[] = [];

  for (const line of lines) {
    if (!title) {
      const heading = line.match(/^#\s+(.*)$/);
      if (heading) {
        title = heading[1].trim();
        continue;
      }
    }

    const item = line.match(ITEM_RE);
    if (item) {
      const depth = item[1] ? 1 : 0;
      const state = MARKER_TO_STATE[item[2]] ?? "todo";
      items.push({ id: crypto.randomUUID(), text: item[3], state, depth });
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

  return { title, items };
}

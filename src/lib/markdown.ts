import { type TodoData } from "./todos";
import { type TodoState } from "./todo";

/**
 * Markdown serialization for a list. A list file looks like:
 *
 *   # My list
 *
 *   - [ ] A todo
 *   - [-] Something on hold
 *   - [x] Something done
 *     with a second line of detail
 *
 * Todo and done use the standard GitHub task-list markers so the files stay
 * readable in any markdown viewer; on-hold uses `- [-]` (the Obsidian/Tasks
 * convention), which other viewers render as a plain bullet. An item's text may
 * span multiple lines: continuation lines are indented two spaces under the
 * item and rejoined on parse.
 */

const STATE_TO_MARKER: Record<TodoState, string> = {
  todo: " ",
  onHold: "-",
  done: "x",
};

const MARKER_TO_STATE: Record<string, TodoState> = {
  " ": "todo",
  "": "todo",
  "-": "onHold",
  "/": "onHold", // also accept the in-progress convention on read
  x: "done",
  X: "done",
};

/** Matches a task line, capturing the marker and the trailing text. */
const ITEM_RE = /^- \[(.?)\]\s?(.*)$/;

export interface ParsedList {
  title: string;
  items: TodoData[];
}

/** Build the markdown for a list. */
export function serializeList(title: string, items: TodoData[]): string {
  const lines: string[] = [`# ${title}`, ""];
  for (const item of items) {
    const marker = STATE_TO_MARKER[item.state];
    const [first = "", ...rest] = item.text.split("\n");
    lines.push(`- [${marker}] ${first}`);
    // Indent continuation lines so they read as part of the item and parse back
    // into the same multi-line text.
    for (const line of rest) lines.push(`  ${line}`);
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
      const state = MARKER_TO_STATE[item[1]] ?? "todo";
      items.push({ id: crypto.randomUUID(), text: item[2], state });
      continue;
    }

    // A non-empty, non-item line that isn't the title is a continuation of the
    // previous item's text (its leading two-space indent is stripped).
    if (items.length > 0 && line.trim() !== "") {
      const last = items[items.length - 1];
      last.text += "\n" + line.replace(/^ {2}/, "");
    }
  }

  return { title, items };
}

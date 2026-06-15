/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

// Serialises a slice of comment HTML to Markdown so a copied selection survives
// paste into plain-text targets (GitHub, chat boxes) that only read the
// text/plain clipboard flavour. Rich targets use the text/html flavour instead;
// this is the universal fallback that keeps lists, bold and links readable.

/** Convert a DOM node (a cloned selection fragment) to Markdown text. */
export function fragmentToMarkdown(root: Node): string {
  return serializeChildren(root, 0)
    .replace(/[ \t]+\n/g, "\n") // strip trailing spaces
    .replace(/\n{3,}/g, "\n\n") // collapse runs of blank lines
    .trim();
}

function serializeChildren(node: Node, indent: number): string {
  let out = "";
  node.childNodes.forEach((child) => {
    out += serializeNode(child, indent);
  });
  return out;
}

function serializeNode(node: Node, indent: number): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "strong":
    case "b":
      return wrap(serializeChildren(el, indent), "**");
    case "em":
    case "i":
      return wrap(serializeChildren(el, indent), "*");
    case "s":
    case "del":
    case "strike":
      return wrap(serializeChildren(el, indent), "~~");
    case "code":
      return wrap(el.textContent ?? "", "`");
    case "a": {
      const href = el.getAttribute("href") ?? "";
      const text = serializeChildren(el, indent);
      return href ? `[${text}](${href})` : text;
    }
    case "br":
      return "\n";
    case "p":
    case "div":
      return `${serializeChildren(el, indent).trim()}\n\n`;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `${"#".repeat(Number(tag[1]))} ${serializeChildren(el, indent).trim()}\n\n`;
    case "blockquote": {
      const inner = serializeChildren(el, indent).trim();
      return `${inner
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}\n\n`;
    }
    case "ul":
    case "ol":
      return `${serializeList(el, indent)}\n`;
    case "pre":
      // Code block (also covers stored mermaid diagrams) - keep the source.
      return `\`\`\`\n${(el.textContent ?? "").trim()}\n\`\`\`\n\n`;
    case "img":
    case "video":
      // Local attachment URLs don't resolve elsewhere; drop them silently.
      return "";
    default:
      return serializeChildren(el, indent);
  }
}

/** Wrap non-empty inner text with a Markdown marker (e.g. ** for bold). */
function wrap(inner: string, marker: string): string {
  return inner ? `${marker}${inner}${marker}` : "";
}

function serializeList(list: HTMLElement, indent: number): string {
  const ordered = list.tagName.toLowerCase() === "ol";
  const pad = "  ".repeat(indent);
  let out = "";
  let i = 1;
  list.childNodes.forEach((child) => {
    if (
      child.nodeType !== Node.ELEMENT_NODE ||
      (child as HTMLElement).tagName.toLowerCase() !== "li"
    ) {
      return;
    }
    const li = child as HTMLElement;
    const marker = ordered ? `${i}. ` : "- ";
    // An <li> holds inline content plus optional nested lists. Pull the nested
    // lists out so they indent under the item rather than inlining into it.
    let inline = "";
    let nested = "";
    li.childNodes.forEach((c) => {
      const t = c.nodeType === Node.ELEMENT_NODE ? (c as HTMLElement).tagName.toLowerCase() : "";
      if (t === "ul" || t === "ol") {
        nested += serializeList(c as HTMLElement, indent + 1);
      } else {
        inline += serializeNode(c, indent);
      }
    });
    inline = inline.trim().replace(/\s*\n\s*/g, " ");
    out += `${pad}${marker}${inline}\n${nested}`;
    i++;
  });
  return out;
}

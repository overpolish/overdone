/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

// Read-only comment code blocks. A comment is stored as a plain
// `<pre><code class="language-…">` (mermaid diagrams live in `<pre data-mermaid>`
// and are left alone). To give the rendered comment the same interactive code
// block as the editor - language picker, copy, soft-wrap, syntax highlighting,
// scroll - the renderer splits the comment into runs of plain HTML and React
// code blocks (see splitComment), and saves edits back to the stored HTML keyed
// by code-block index (see setCodeBlockAttr).

const LANG_PREFIX = "language-";

/** One piece of a rendered comment: a run of plain HTML (rendered as-is), a code
 * block (rendered by the interactive React component), or a table (rendered in a
 * horizontal ScrollArea). */
export type CommentSegment =
  | { kind: "html"; html: string }
  | { kind: "table"; html: string }
  | {
      kind: "code";
      /** Index among the comment's code blocks (mermaid excluded), for saving. */
      index: number;
      /** The language name, or "" for auto-detect. */
      language: string;
      wrap: boolean;
      /** Raw code (for the copy button). */
      code: string;
      /** The already-highlighted inner HTML (hljs spans) to render. */
      highlighted: string;
    };

function codeLanguageOf(code: Element | null): string {
  const cls = [...(code?.classList ?? [])].find((c) => c.startsWith(LANG_PREFIX));
  return cls ? cls.slice(LANG_PREFIX.length) : "";
}

/**
 * Split rendered comment HTML (already syntax-highlighted) into ordered segments,
 * pulling each top-level code block out as its own segment and grouping the HTML
 * around them into runs. Comments with no code blocks come back as a single HTML
 * segment.
 */
export function splitComment(html: string): CommentSegment[] {
  if (!html.includes("<pre") && !html.includes("<table")) return [{ kind: "html", html }];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const segments: CommentSegment[] = [];
  let run = "";
  let index = 0;
  const flush = () => {
    if (run) segments.push({ kind: "html", html: run });
    run = "";
  };

  for (const node of [...doc.body.childNodes]) {
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null;
    if (el?.tagName === "PRE" && !el.hasAttribute("data-mermaid")) {
      flush();
      const code = el.querySelector("code");
      segments.push({
        kind: "code",
        index: index++,
        language: codeLanguageOf(code),
        wrap: el.getAttribute("data-wrap") === "true",
        code: code?.textContent ?? "",
        highlighted: code?.innerHTML ?? "",
      });
    } else if (el?.tagName === "TABLE") {
      flush();
      segments.push({ kind: "table", html: el.outerHTML });
    } else {
      run += el ? el.outerHTML : (node.textContent ?? "");
    }
  }
  flush();
  return segments;
}

/** Patch the language and/or wrap of the `index`-th code block in stored comment
 * HTML, returning the new HTML to save. Language is written as the `<code>`'s
 * `language-…` class (the renderer re-highlights from it); wrap as `data-wrap` on
 * the `<pre>`. */
export function setCodeBlockAttr(
  html: string,
  index: number,
  patch: { language?: string | null; wrap?: boolean },
): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const pre = doc.querySelectorAll("pre:not([data-mermaid])")[index];
  if (!pre) return html;

  if (patch.wrap !== undefined) {
    if (patch.wrap) pre.setAttribute("data-wrap", "true");
    else pre.removeAttribute("data-wrap");
  }
  if (patch.language !== undefined) {
    const code = pre.querySelector("code");
    if (code) {
      [...code.classList].filter((c) => c.startsWith(LANG_PREFIX)).forEach((c) => {
        code.classList.remove(c);
      });
      if (patch.language) code.classList.add(`${LANG_PREFIX}${patch.language}`);
    }
  }
  return doc.body.innerHTML;
}

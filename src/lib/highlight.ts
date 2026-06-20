/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { toHtml } from "hast-util-to-html";
import { common, createLowlight } from "lowlight";

/**
 * One lowlight instance (the ~35 common highlight.js languages) shared by the
 * editor's live code-block highlighting (CodeBlockLowlight) and the read-only
 * comment renderer below, so both colour code the same way.
 */
export const lowlight = createLowlight(common);

/** The registered language names, alphabetised - the code block's language field
 * autocompletes against these. */
export const codeLanguages = lowlight.listLanguages().sort();

/** The `language-xxx` class CodeBlockLowlight writes; pull the language name out. */
function codeLanguage(code: Element): string | null {
  const cls = [...code.classList].find((c) => c.startsWith("language-"));
  return cls ? cls.slice("language-".length) : null;
}

/**
 * Highlight every `<pre><code>` block in a fragment of stored comment HTML,
 * returning new HTML with the hljs token spans baked in. Code blocks are stored
 * plain (the editor highlights via decorations, not in the document), so the
 * read-only view re-highlights here. Mermaid diagrams live in `<pre
 * data-mermaid>` with no `<code>` child, so they're left untouched. Returns the
 * input unchanged when there are no code blocks.
 */
export function highlightCodeInHtml(html: string): string {
  if (!html.includes("<pre")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = doc.querySelectorAll("pre:not([data-mermaid]) > code");
  if (blocks.length === 0) return html;
  for (const code of blocks) {
    const text = code.textContent ?? "";
    if (!text.trim()) continue;
    const lang = codeLanguage(code);
    try {
      const tree =
        lang && lowlight.registered(lang)
          ? lowlight.highlight(lang, text)
          : lowlight.highlightAuto(text);
      code.innerHTML = toHtml(tree);
      code.classList.add("hljs");
    } catch {
      // Unknown language / highlighter hiccup: leave the block as plain text.
    }
  }
  return doc.body.innerHTML;
}

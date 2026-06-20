/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { IconCheck, IconCopy, IconTextWrap } from "@tabler/icons-react";
import {
  type NodeViewProps,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { lowlight } from "../../lib/highlight";
import { CodeLanguageField } from "./CodeLanguageField";
import { IconButton } from "../ui/IconButton";
import { ScrollArea } from "../ui/ScrollArea";

/**
 * The code block's editing view: a top bar with the language field on the left
 * and a soft-wrap toggle on the right, then the code itself. Picking or typing a
 * language re-highlights the block (an empty field means auto-detect,
 * `language: null`); the wrap toggle flips the block between horizontal scroll
 * (default) and soft wrapping. Both controls are editor-only - serialization
 * emits a plain `<pre data-wrap><code class="language-…">`, which the read-only
 * comment view highlights and styles from.
 */
function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const wrap = Boolean(node.attrs.wrap);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Copy the block's raw code (newlines included), with a brief check-mark cue.
  const copy = () => {
    void navigator.clipboard.writeText(node.textContent);
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1200);
  };
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  return (
    <NodeViewWrapper as="pre" data-wrap={wrap ? "true" : undefined}>
      <div className="code-block-bar" contentEditable={false}>
        <CodeLanguageField
          value={language}
          onChange={(lang) => updateAttributes({ language: lang || null })}
        />
        <span className="code-block-actions">
          <IconButton
            label={copied ? "Copied" : "Copy code"}
            icon={copied ? IconCheck : IconCopy}
            active={copied}
            compact
            onClick={copy}
          />
          <IconButton
            label={wrap ? "Disable soft wrap" : "Soft wrap"}
            icon={IconTextWrap}
            active={wrap}
            compact
            onClick={() => updateAttributes({ wrap: !wrap })}
          />
        </span>
      </div>
      {/* The static header above sits in normal flow, so this OverlayScrollbars
          horizontal scroller (and its edge shadows) belongs only to the code,
          never the header. NodeViewContent forces an inline white-space: pre-wrap;
          override it inline (a stylesheet rule can't win against it) so the wrap
          toggle actually takes effect. */}
      <ScrollArea orientation="horizontal" radius={0}>
        <NodeViewContent<"code"> as="code" style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }} />
      </ScrollArea>
    </NodeViewWrapper>
  );
}

/** CodeBlockLowlight with the language-field node view. */
export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      // Per-block soft-wrap, off by default (code scrolls horizontally).
      // Serialized as `data-wrap` on the <pre> so the read-only body matches.
      wrap: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-wrap") === "true",
        renderHTML: (attributes) => (attributes.wrap ? { "data-wrap": "true" } : {}),
      },
    };
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      // The base extension can exit a code block downward (exitOnArrowDown) but
      // has no way up, so a code block as the document's first node traps the
      // cursor with no way to add content above it. Pressing Up on its first line
      // inserts an empty paragraph before it and moves there.
      ArrowUp: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (!empty || $from.parent.type !== this.type) return false;
        // Only when this block is the very first node...
        if ($from.before() !== 0) return false;
        // ...and the cursor is on its first line (nothing above to step onto).
        if ($from.parent.textBetween(0, $from.parentOffset).includes("\n")) return false;
        return editor.chain().insertContentAt(0, { type: "paragraph" }).setTextSelection(1).run();
      },
    };
  },
}).configure({ lowlight });

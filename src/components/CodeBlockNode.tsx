/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Popover } from "@mantine/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { IconCheck, IconCopy, IconTextWrap } from "@tabler/icons-react";
import {
  type NodeViewProps,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { codeLanguages, lowlight } from "../lib/highlight";
import { IconButton } from "./IconButton";
import { ScrollArea } from "./ScrollArea";

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

/**
 * The in-block language field: an unstyled input with a suggestion popover whose
 * rows match the label/assignee pickers. The input doubles as the search; picking
 * (or Enter) commits the language and blurs the field, while typing then blurring
 * commits whatever was entered (an unknown name just auto-detects on highlight).
 */
function CodeLanguageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (lang: string) => void;
}) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  // The keyboard-highlighted row (arrow keys move it, Enter picks it).
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when a row is picked so the blur it triggers doesn't re-commit the stale
  // search text (the pick already committed; setSearch hasn't flushed yet).
  const justPicked = useRef(false);

  // Reflect external language changes (e.g. undo) while not being edited.
  useEffect(() => {
    if (!open) setSearch(value);
  }, [value, open]);

  const q = search.trim().toLowerCase();
  const matches = (q ? codeLanguages.filter((l) => l.includes(q)) : codeLanguages).slice(0, 60);
  // Clamp the highlight in case the match list shrank under it.
  const highlight = Math.min(activeIndex, Math.max(matches.length - 1, 0));

  const pick = (lang: string) => {
    justPicked.current = true;
    setSearch(lang);
    onChange(lang);
    setOpen(false);
    // Selecting commits and drops focus, so the dropdown doesn't reopen.
    inputRef.current?.blur();
  };

  return (
    <Box component="span" contentEditable={false} style={{ flex: 1, minWidth: 0, display: "block" }}>
      <Popover
        opened={open && matches.length > 0}
        onChange={setOpen}
        position="bottom-start"
        offset={2}
        width={160}
        shadow="md"
        radius="md"
        trapFocus={false}
        returnFocus={false}
        withinPortal
      >
        <Popover.Target>
          <input
            ref={inputRef}
            className="code-block-lang"
            spellCheck={false}
            placeholder="auto"
            aria-label="Code language"
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => {
              setActiveIndex(0);
              setOpen(true);
            }}
            onBlur={() => {
              setOpen(false);
              if (justPicked.current) {
                justPicked.current = false;
                return;
              }
              if (search !== value) onChange(search.trim());
            }}
            onKeyDown={(e) => {
              // Keep field keys from reaching the editor (Backspace deleting the block).
              e.stopPropagation();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setOpen(true);
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(matches[highlight] ?? search.trim());
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </Popover.Target>
        <Popover.Dropdown p={0} style={{ overflow: "hidden" }}>
          <ScrollArea maxHeight={150} radius="md">
            {matches.map((lang, i) => (
              <Option
                key={lang}
                current={lang === value}
                highlighted={i === highlight}
                onHover={() => setActiveIndex(i)}
                onSelect={() => pick(lang)}
              >
                {lang}
              </Option>
            ))}
          </ScrollArea>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}

/** One suggestion row, matching the label/assignee picker option. `current` bolds
 * the active language; `highlighted` is the keyboard/hover cursor. `onMouseDown`
 * (not click) fires before the input's blur closes the list; `onMouseMove` (not
 * enter) lets the mouse take the highlight only when it actually moves, so it
 * doesn't fight arrow-key navigation under a stationary pointer. */
function Option({
  current,
  highlighted,
  onHover,
  onSelect,
  children,
}: {
  current: boolean;
  highlighted: boolean;
  onHover: () => void;
  onSelect: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Keep the keyboard-highlighted row in view as it moves past an edge.
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);
  return (
    <Box
      ref={ref}
      component="button"
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseMove={onHover}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 8px",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontSize: "var(--mantine-font-size-xs)",
        fontWeight: current ? 600 : 400,
        color: "var(--mantine-color-text)",
        background: highlighted ? "var(--mantine-color-default-hover)" : "transparent",
      }}
    >
      {children}
    </Box>
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

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Button, Group, Stack, Text } from "@mantine/core";
import { IconCheck, IconPencil, IconTrash } from "@tabler/icons-react";
import { type Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { setCodeBlockAttr, splitComment } from "../../lib/code-blocks";
import { highlightCodeInHtml } from "../../lib/highlight";
import { openExternal } from "../../lib/links";
import { applyTableColumns } from "../../lib/table-layout";
import { fragmentToMarkdown } from "../../lib/markdown";
import {
  insertPastedFiles,
  openFullSize,
  pickAndInsert,
  toDisplayHtml,
} from "../../lib/media";
import { renderMermaidInHtml } from "../../lib/mermaid";
import { usePanelGuard } from "../../lib/panel-guard";
import { type Comment } from "../../lib/todos";
import { CommentInput, FormatBar, useCommentEditor } from "../editor/CommentEditor";
import { useDiagramEditor } from "../diagram";
import { IconButton } from "../ui/IconButton";
import { ScrollArea } from "../ui/ScrollArea";
import { ReadOnlyCodeBlock } from "./ReadOnlyCodeBlock";
import { useMediaBusy } from "./useMediaBusy";

/** The tag of the nearest list enclosing the selection's anchor, so a re-wrapped
 * fragment matches the source (numbered vs bulleted). Defaults to a bullet list. */
function selectionListTag(sel: Selection): "ul" | "ol" {
  for (let node = sel.anchorNode; node && node !== document.body; node = node.parentNode) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = (node as HTMLElement).tagName.toLowerCase();
    if (tag === "ol" || tag === "ul") return tag;
  }
  return "ul";
}

/**
 * A selection confined to one list has that `<ul>`/`<ol>` as its range's common
 * ancestor, which `Range.cloneContents()` excludes - leaving bare `<li>`s with no
 * wrapper, so both clipboard flavours drop the bullets. Wrap each run of
 * top-level `<li>`s back into a list of the source's type to restore them.
 */
function rewrapListItems(container: HTMLElement, sel: Selection): void {
  if (!container.querySelector(":scope > li")) return;
  const tag = selectionListTag(sel);
  let list: HTMLElement | null = null;
  for (const node of Array.from(container.childNodes)) {
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null;
    if (el?.tagName.toLowerCase() === "li") {
      if (!list) {
        list = document.createElement(tag);
        container.insertBefore(list, node);
      }
      list.appendChild(node);
    } else if (list && node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) {
      // Keep insignificant whitespace between items inside the run.
      list.appendChild(node);
    } else {
      list = null;
    }
  }
}

/** Compact, human timestamp for a comment (e.g. "Jun 13, 2:05 PM"). */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface CommentRowProps {
  comment: Comment;
  listId: string;
  mediaDir: string;
  editing: boolean;
  onStartEdit: () => void;
  onSave: (html: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}

/** One entry in the comment log: timestamped rich text with hover edit/delete. */
export function CommentRow({
  comment,
  listId,
  mediaDir,
  editing,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
}: CommentRowProps) {
  const openDiagram = useDiagramEditor();

  // Write an edited diagram back into the comment: replace the nth stored
  // `<pre data-mermaid>` (the one that was clicked) with the new source.
  const saveDiagram = (index: number, code: string) => {
    const doc = new DOMParser().parseFromString(comment.text, "text/html");
    const pre = doc.querySelectorAll("pre[data-mermaid]")[index];
    if (!pre) return;
    pre.textContent = code;
    onSave(doc.body.innerHTML);
  };

  // Comment HTML with attachment refs resolved to asset URLs, then code blocks
  // syntax-highlighted (stored plain; see highlightCodeInHtml). Diagrams are
  // rendered into it asynchronously (below); until that resolves we show the
  // highlighted HTML, so non-diagram comments render immediately.
  const displayHtml = toDisplayHtml(comment.text, mediaDir);
  const highlighted = useMemo(
    () => applyTableColumns(highlightCodeInHtml(displayHtml)),
    [displayHtml],
  );
  const [rendered, setRendered] = useState(highlighted);
  useEffect(() => {
    if (!highlighted.includes("data-mermaid")) {
      setRendered(highlighted);
      return;
    }
    let cancelled = false;
    void renderMermaidInHtml(highlighted).then((html) => {
      if (!cancelled) setRendered(html);
    });
    return () => {
      cancelled = true;
    };
  }, [highlighted]);

  // Split the rendered HTML into plain-HTML runs, code blocks, and tables, so each
  // code block renders as the interactive React component and each table in a
  // horizontal ScrollArea (the rest stays raw HTML). A code block's language/wrap
  // change saves back to the stored comment, keyed by index.
  const segments = useMemo(() => splitComment(rendered), [rendered]);
  const saveCodeBlock = (index: number, patch: { language?: string | null; wrap?: boolean }) => {
    onSave(setCodeBlockAttr(comment.text, index, patch));
  };

  if (editing) {
    return (
      <CommentEditView
        comment={comment}
        listId={listId}
        mediaDir={mediaDir}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
  }

  return (
    // The hover/focus reveal of the actions is pure CSS (see `.comment-row` in
    // theme.css), not React state: a re-render here re-applies the body's
    // `dangerouslySetInnerHTML`, replacing its child nodes and collapsing any
    // in-progress text selection. Keeping mouse-out off the render path lets a
    // selection survive the pointer leaving the tile.
    <Box
      className="comment-row"
      style={{
        padding: "6px 8px",
        borderRadius: "var(--mantine-radius-md)",
        background: "var(--mantine-color-default)",
      }}
    >
      {/* The comment's rich-text HTML, with attachment refs resolved to URLs.
          Clicking an image opens it full-size in the OS viewer (the popover is
          too small to expand into); videos keep their inline controls. */}
      <Box
        className="comment-body"
        fz="xs"
        style={{ wordBreak: "break-word" }}
        // Native copy in the webview only writes plain text for non-editable
        // content, dropping all formatting. Put both flavours on the clipboard
        // ourselves: HTML for rich targets (Notes, Mail), and Markdown as the
        // text/plain fallback so lists/bold survive paste into plain-text boxes
        // (GitHub, chat) that ignore the HTML flavour.
        onCopy={(e) => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
          const frag = document.createElement("div");
          for (let i = 0; i < sel.rangeCount; i++) {
            frag.appendChild(sel.getRangeAt(i).cloneContents());
          }
          // Restore the list wrapper that cloneContents drops for a list-only
          // selection, so copied bullets survive into both flavours.
          rewrapListItems(frag, sel);
          const html = frag.innerHTML;
          if (!html) return;
          e.clipboardData.setData("text/html", html);
          e.clipboardData.setData("text/plain", fragmentToMarkdown(frag));
          e.preventDefault();
        }}
        onClick={(e) => {
          const el = e.target as HTMLElement;
          // A link opens in the default browser - never navigate the app webview.
          const anchor = el.closest<HTMLAnchorElement>("a[href]");
          if (anchor) {
            e.preventDefault();
            void openExternal(anchor.href);
            return;
          }
          // A click anywhere inside a rendered diagram opens it (zoom/pan, with
          // an Edit button); a broken one opens straight into the editor.
          const diagram = el.closest<HTMLElement>(".mermaid-rendered");
          if (diagram) {
            const index = Number(diagram.dataset.mermaidIndex);
            openDiagram({
              code: diagram.dataset.mermaidSrc ?? "",
              editable: true,
              initialMode: diagram.classList.contains("mermaid-broken") ? "edit" : "view",
              onSave: (code) => saveDiagram(index, code),
            });
          } else if (el.tagName === "IMG") {
            void openFullSize(el.getAttribute("src") ?? "", mediaDir);
          }
        }}
      >
        {segments.map((seg, i) => {
          if (seg.kind === "code") {
            return (
              <ReadOnlyCodeBlock
                key={`code-${seg.index}`}
                block={seg}
                onChange={(patch) => saveCodeBlock(seg.index, patch)}
              />
            );
          }
          if (seg.kind === "table") {
            // The table scrolls horizontally in the app's overlay ScrollArea when
            // it's wider than the comment (the same component the editor uses).
            return (
              <ScrollArea key={`table-${i}`} orientation="horizontal" radius={0} style={{ margin: "0.4em 0" }}>
                <div dangerouslySetInnerHTML={{ __html: seg.html }} />
              </ScrollArea>
            );
          }
          // A run of plain comment HTML. `display: contents` keeps the wrapper out
          // of the layout so margins read as if these were direct children.
          return (
            <div
              key={`html-${i}`}
              style={{ display: "contents" }}
              dangerouslySetInnerHTML={{ __html: seg.html }}
            />
          );
        })}
      </Box>
      <Group justify="space-between" wrap="nowrap" mt={4} gap={4}>
        <Text size="10px" c="dimmed">
          {formatTime(comment.createdAt)}
          {comment.editedAt ? " · edited" : ""}
        </Text>
        {/* Edit/delete reveal on hover or keyboard focus (CSS) to keep the log
            uncluttered. They stay focusable (opacity, not display) so tabbing
            through the log reveals them via :focus-within. */}
        <Group className="comment-actions" gap={2} wrap="nowrap">
          <IconButton label="Edit comment" icon={IconPencil} onClick={onStartEdit} />
          <IconButton label="Delete comment" icon={IconTrash} danger onClick={onDelete} />
        </Group>
      </Group>
    </Box>
  );
}

interface CommentEditViewProps {
  comment: Comment;
  listId: string;
  mediaDir: string;
  onSave: (html: string) => void;
  onCancel: () => void;
}

/** Inline editor for an existing comment: input, then format bar + Cancel/Save. */
function CommentEditView({ comment, listId, mediaDir, onSave, onCancel }: CommentEditViewProps) {
  const [draft, setDraft] = useState(comment.text);
  const { busy, busyLabel, error, run } = useMediaBusy();
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // The edit UI is taller than a comment row; if it's the last entry its
  // buttons fall below the scroll fold. Scroll its bottom into view (after the
  // editor has laid out) so the Cancel/Save row isn't clipped.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      containerRef.current?.scrollIntoView({ block: "end" }),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const editor = useCommentEditor({
    content: toDisplayHtml(comment.text, mediaDir),
    autoFocus: true,
    holdPanelOpen: true,
    onChange: setDraft,
    onSubmit: () => onSave(draft),
    onEscape: onCancel,
    onPasteFiles: (files) => {
      const ed = editorRef.current;
      if (ed) run(() => insertPastedFiles(ed, listId, mediaDir, files));
    },
  });
  editorRef.current = editor;

  // Report this inline edit to the guard (dirty once the text diverges from the
  // saved comment, plus how to commit / cancel it) so a dismissal that would lose
  // the changes prompts first. Every render so the closures stay fresh; cleared
  // when the edit closes (save or cancel).
  useEffect(() => {
    usePanelGuard.getState().setInline({
      dirty: draft !== comment.text,
      save: () => onSave(draft),
      discard: onCancel,
    });
  });
  useEffect(() => () => usePanelGuard.getState().setInline(null), []);

  return (
    <Stack gap={6} ref={containerRef}>
      <FormatBar
        editor={editor}
        onAddMedia={() => editor && run(() => pickAndInsert(editor, listId, mediaDir))}
      />
      <CommentInput editor={editor} busy={busy} busyLabel={busyLabel} />
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
      <Group justify="flex-end" gap={6} wrap="nowrap">
        <Button size="xs" variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="xs"
          onClick={() => onSave(draft)}
          leftSection={<IconCheck size={14} stroke={1.8} />}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}

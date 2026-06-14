/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Button, Group, Stack, Text } from "@mantine/core";
import { IconCheck, IconPencil, IconTrash } from "@tabler/icons-react";
import { type Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { openExternal } from "../../lib/links";
import {
  insertPastedFiles,
  openFullSize,
  pickAndInsert,
  toDisplayHtml,
} from "../../lib/media";
import { renderMermaidInHtml } from "../../lib/mermaid";
import { type Comment } from "../../lib/todos";
import { CommentInput, FormatBar, useCommentEditor } from "../CommentEditor";
import { useDiagramEditor } from "../diagram";
import { IconButton } from "../IconButton";
import { useMediaBusy } from "./useMediaBusy";

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
  const [hovered, setHovered] = useState(false);
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

  // Comment HTML with attachment refs resolved to asset URLs. Diagrams are then
  // rendered into it asynchronously (below); until that resolves we show the raw
  // HTML, so non-diagram comments render immediately.
  const displayHtml = toDisplayHtml(comment.text, mediaDir);
  const [rendered, setRendered] = useState(displayHtml);
  useEffect(() => {
    if (!displayHtml.includes("data-mermaid")) {
      setRendered(displayHtml);
      return;
    }
    let cancelled = false;
    void renderMermaidInHtml(displayHtml).then((html) => {
      if (!cancelled) setRendered(html);
    });
    return () => {
      cancelled = true;
    };
  }, [displayHtml]);

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
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
      <Group justify="space-between" wrap="nowrap" mt={4} gap={4}>
        <Text size="10px" c="dimmed">
          {formatTime(comment.createdAt)}
          {comment.editedAt ? " · edited" : ""}
        </Text>
        {/* Edit/delete reveal on hover to keep the log uncluttered. */}
        <Group gap={2} wrap="nowrap" style={{ opacity: hovered ? 1 : 0 }}>
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
    onChange: setDraft,
    onSubmit: () => onSave(draft),
    onEscape: onCancel,
    onPasteFiles: (files) => {
      const ed = editorRef.current;
      if (ed) run(() => insertPastedFiles(ed, listId, mediaDir, files));
    },
  });
  editorRef.current = editor;

  return (
    <Stack gap={6} ref={containerRef}>
      <CommentInput editor={editor} busy={busy} busyLabel={busyLabel} />
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
      <Group justify="space-between" wrap="nowrap">
        <FormatBar
          editor={editor}
          onAddMedia={() => editor && run(() => pickAndInsert(editor, listId, mediaDir))}
        />
        <Group gap={6} wrap="nowrap">
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
      </Group>
    </Stack>
  );
}

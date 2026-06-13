import { Box, Button, Group, Stack, Text, Title } from "@mantine/core";
import {
  IconCheck,
  IconInfoCircle,
  IconPencil,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { type Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  insertDroppedPaths,
  insertPastedFiles,
  openFullSize,
  pickAndInsert,
  referencedMedia,
  toDisplayHtml,
  toStoredHtml,
} from "../lib/media";
import { closePanel, emitDetailsAction } from "../lib/panel";
import { useSettings } from "../lib/settings";
import { type Comment } from "../lib/todos";
import {
  CommentInput,
  FormatBar,
  htmlIsEmpty,
  useCommentEditor,
} from "./CommentEditor";
import { IconButton } from "./IconButton";
import { ScrollArea } from "./ScrollArea";

interface ItemDetailsProps {
  itemId: string;
  /** The item's current comment log, used to seed the editor. */
  comments: Comment[];
  /** Active list id and its media folder (abs path), for attachments. */
  listId: string;
  mediaDir: string;
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

/**
 * Tracks in-flight attachment imports so the editor can show a busy overlay.
 * `run` wraps an import op, counting it as in-flight until it settles.
 */
function useMediaBusy() {
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const compressing = useSettings((s) => s.mediaCompression === "compressed");
  const run = useCallback((fn: () => Promise<void>) => {
    setError(null);
    setCount((c) => c + 1);
    void Promise.resolve()
      .then(fn)
      .catch((e) => setError(typeof e === "string" ? e : (e?.message ?? "Failed to add attachment")))
      .finally(() => setCount((c) => c - 1));
  }, []);
  return { busy: count > 0, busyLabel: compressing ? "Compressing…" : "Adding…", error, run };
}

/**
 * Item details, shown in the floating panel pinned below the row. For now this
 * is the comment log — post (⌘/Ctrl+Enter or the Post button), edit, and delete
 * entries, each timestamped. Comments are rich text (bold / italic / underline /
 * lists) and can embed images & videos (toolbar button, drag-drop, or paste).
 * The panel owns the editing session and streams the whole updated log back to
 * the main window (which owns the list and autosaves) on each change.
 */
export function ItemDetails({ itemId, comments: initial, listId, mediaDir }: ItemDetailsProps) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [draft, setDraft] = useState("");
  // Which comment is being edited (single source of truth across rows).
  const [editingId, setEditingId] = useState<string | null>(null);
  const { busy, busyLabel, error, run } = useMediaBusy();
  // The composer editor, via a ref so the once-created handlers can reach it.
  const composerRef = useRef<Editor | null>(null);

  // Persist a new log to the store (via the main window) and keep it locally.
  const apply = (next: Comment[]) => {
    // Delete attachments this change drops (e.g. a removed comment or image)
    // right away. Targeted, so it never touches an unposted draft's media.
    const after = new Set(referencedMedia(next.map((c) => c.text)));
    const removed = referencedMedia(comments.map((c) => c.text)).filter((f) => !after.has(f));
    if (removed.length && listId) {
      void invoke("delete_attachments", { listId, files: removed });
    }
    setComments(next);
    emitDetailsAction({ itemId, comments: next });
  };

  const post = () => {
    const stored = toStoredHtml(draft);
    if (htmlIsEmpty(stored)) return;
    apply([...comments, { id: crypto.randomUUID(), text: stored, createdAt: Date.now() }]);
    composerRef.current?.commands.clearContent();
    composerRef.current?.commands.focus();
    setDraft("");
  };

  const composer = useCommentEditor({
    content: "",
    placeholder: "Add a comment…",
    autoFocus: true,
    onChange: setDraft,
    onSubmit: post,
    onEscape: closePanel,
    onPasteFiles: (files) => {
      const ed = composerRef.current;
      if (ed) run(() => insertPastedFiles(ed, listId, mediaDir, files));
    },
  });
  composerRef.current = composer;

  // OS file drops land as paths (Tauri intercepts them) → insert in the composer.
  useEffect(() => {
    let off: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type !== "drop") return;
        const { paths } = e.payload;
        const ed = composerRef.current;
        if (ed) run(() => insertDroppedPaths(ed, listId, mediaDir, paths));
      })
      .then((f) => (off = f));
    return () => off?.();
  }, [listId, mediaDir, run]);

  const remove = (id: string) => apply(comments.filter((c) => c.id !== id));

  const saveEdit = (id: string, html: string) => {
    const stored = toStoredHtml(html);
    // Clearing the text (and any media) removes the comment.
    if (htmlIsEmpty(stored)) return remove(id);
    apply(
      comments.map((c) =>
        c.id === id ? { ...c, text: stored, editedAt: Date.now() } : c,
      ),
    );
  };

  return (
    <Stack gap="md" w={340}>
      <Group gap={8} wrap="nowrap">
        <IconInfoCircle size={18} stroke={1.8} />
        <Title order={5}>Details</Title>
      </Group>

      <Stack gap="xs">
        {/* Heading carries the format controls for the composer on its right. */}
        <Group justify="space-between" wrap="nowrap" align="center" h={22}>
          <Text size="xs" fw={600} c="dimmed">
            COMMENTS
          </Text>
          <FormatBar
            editor={composer}
            onAddMedia={() => composer && run(() => pickAndInsert(composer, listId, mediaDir))}
          />
        </Group>

        <CommentInput editor={composer} busy={busy} busyLabel={busyLabel} />
        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end">
          <Button
            size="xs"
            onClick={post}
            disabled={htmlIsEmpty(draft)}
            leftSection={<IconSend size={14} stroke={1.8} />}
          >
            Post
          </Button>
        </Group>

        {comments.length > 0 && (
          <ScrollArea maxHeight={260} radius="var(--mantine-radius-md)">
            {/* Newest first; storage stays chronological (new posts append). */}
            <Stack gap={8} pt={4} pb={2}>
              {comments
                .slice()
                .reverse()
                .map((c) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    listId={listId}
                    mediaDir={mediaDir}
                    editing={editingId === c.id}
                    onStartEdit={() => setEditingId(c.id)}
                    onSave={(html) => {
                      saveEdit(c.id, html);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => remove(c.id)}
                  />
                ))}
            </Stack>
          </ScrollArea>
        )}
      </Stack>
    </Stack>
  );
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
function CommentRow({
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
        fz="sm"
        style={{ wordBreak: "break-word" }}
        onClick={(e) => {
          const el = e.target as HTMLElement;
          if (el.tagName === "IMG") {
            void openFullSize(el.getAttribute("src") ?? "", mediaDir);
          }
        }}
        dangerouslySetInnerHTML={{ __html: toDisplayHtml(comment.text, mediaDir) }}
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

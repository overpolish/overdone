import { Box, Button, Group, Stack, Text, Title } from "@mantine/core";
import { DatePickerInput, DateTimePicker } from "@mantine/dates";
import {
  IconBell,
  IconCalendar,
  IconCheck,
  IconInfoCircle,
  IconPencil,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
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
import { renderMermaidInHtml } from "../lib/mermaid";
import { closePanel, emitDatesAction, emitDetailsAction } from "../lib/panel";
import { useSettings } from "../lib/settings";
import { type Assignee, type Comment } from "../lib/todos";
import { AssigneePicker, useAssigneeEditor } from "./AssigneePicker";
import { DiagramModalHost, useDiagramEditor } from "./DiagramModal";
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
  /** The list's assignee roster, to seed the picker's suggestions. */
  roster: Assignee[];
  /** The item's current assignee ids. */
  assigneeIds: string[];
  /** The item's notification time (epoch ms, date + time), if set. */
  notifyAt?: number;
  /** The item's due date (epoch ms at UTC midnight, date only), if set. */
  dueDate?: number;
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

// Mantine's date components speak strings: dates are "YYYY-MM-DD", date-times
// "YYYY-MM-DD HH:mm:ss" (local wall-clock). The store keeps epoch ms, so convert
// at the boundary. A due date is stored at local midnight (date-only).
const DATE_FMT = "YYYY-MM-DD";
const DATETIME_FMT = "YYYY-MM-DD HH:mm:ss";

const toDateStr = (ms: number | undefined) => (ms == null ? null : dayjs(ms).format(DATE_FMT));
const toDateTimeStr = (ms: number | undefined) =>
  ms == null ? null : dayjs(ms).format(DATETIME_FMT);
const fromStr = (s: string | null) => (s ? dayjs(s).valueOf() : undefined);

/** Today at 00:00 as a date string — the floor for both fields (no past dates). */
const todayStr = () => dayjs().startOf("day").format(DATE_FMT);

/**
 * Controller for editing one item's notification time and due date. Holds the
 * working pair locally and streams each change back to the main window (the
 * list owner) which persists it. Both values are sent together so clearing one
 * is unambiguous. Mirrors the comment editor's fire-and-forget flow (no
 * back-sync), so it stays simple — the panel re-seeds from the store on reopen.
 */
function useDatesEditor(
  itemId: string,
  initialNotifyAt: number | undefined,
  initialDueDate: number | undefined,
) {
  const [notifyAt, setNotifyAtState] = useState(initialNotifyAt);
  const [dueDate, setDueDateState] = useState(initialDueDate);

  const setNotifyAt = (ms: number | undefined) => {
    setNotifyAtState(ms);
    emitDatesAction({ itemId, notifyAt: ms, dueDate });
  };
  const setDueDate = (ms: number | undefined) => {
    setDueDateState(ms);
    emitDatesAction({ itemId, notifyAt, dueDate: ms });
  };

  return { notifyAt, dueDate, setNotifyAt, setDueDate };
}

/**
 * Notification time + due date, stacked in the panel's right column. Each opens
 * a Mantine picker in a popover (floats over the panel rather than growing it);
 * both are floored to today so nothing can be scheduled in the past. Floating
 * (vs. the old in-flow picker) keeps the panel from ballooning when a field is
 * open; the popover shifts to stay within the window.
 */
function DatesSection({ dates }: { dates: ReturnType<typeof useDatesEditor> }) {
  const min = todayStr();
  const icon = (Icon: typeof IconBell) => (
    <Icon size={14} stroke={1.8} style={{ display: "block" }} />
  );

  // A notification can't fire in the past: minDate blocks past days, and this
  // clamps a same-day time that's already gone up to now.
  const changeNotify = (s: string | null) => {
    let ms = fromStr(s);
    if (ms != null && ms < Date.now()) ms = Date.now();
    dates.setNotifyAt(ms);
  };

  return (
    <>
      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed">
          NOTIFY
        </Text>
        <DateTimePicker
          size="xs"
          clearable
          minDate={min}
          value={toDateTimeStr(dates.notifyAt)}
          onChange={changeNotify}
          defaultTimeValue={dayjs().format("HH:mm")}
          valueFormat="MMM D, h:mm A"
          placeholder="Set…"
          leftSection={icon(IconBell)}
          // Open to the left of the field — it lives in the panel's right
          // column, so dropping down/right would clip against the window edge.
          popoverProps={{ position: "left-start" }}
          // Plain spin fields, no nested time dropdown (it would clip / stack a
          // second popover); commit is live, so hide the submit ✓ — the popover
          // closes on outside-click.
          timePickerProps={{ withDropdown: false, format: "12h" }}
          submitButtonProps={{ style: { display: "none" } }}
        />
      </Stack>
      <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed">
          DUE
        </Text>
        <DatePickerInput
          size="xs"
          clearable
          minDate={min}
          value={toDateStr(dates.dueDate)}
          onChange={(s) => dates.setDueDate(fromStr(s))}
          valueFormat="MMM D, YYYY"
          placeholder="Set…"
          leftSection={icon(IconCalendar)}
          // Open to the left (see NOTIFY above) so the calendar clears the window edge.
          popoverProps={{ position: "left-start" }}
        />
      </Stack>
    </>
  );
}

/**
 * Item details, shown in the floating panel pinned below the row. For now this
 * is the comment log — post (⌘/Ctrl+Enter or the Post button), edit, and delete
 * entries, each timestamped. Comments are rich text (bold / italic / underline /
 * lists) and can embed images & videos (toolbar button, drag-drop, or paste).
 * The panel owns the editing session and streams the whole updated log back to
 * the main window (which owns the list and autosaves) on each change.
 */
export function ItemDetails({
  itemId,
  comments: initial,
  listId,
  mediaDir,
  roster: initialRoster,
  assigneeIds: initialAssigneeIds,
  notifyAt: initialNotifyAt,
  dueDate: initialDueDate,
}: ItemDetailsProps) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [draft, setDraft] = useState("");
  const assignees = useAssigneeEditor(itemId, initialRoster, initialAssigneeIds);
  const dates = useDatesEditor(itemId, initialNotifyAt, initialDueDate);
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
    <Stack gap="md" w={620}>
      <DiagramModalHost />
      <Group gap={8} wrap="nowrap">
        <IconInfoCircle size={18} stroke={1.8} />
        <Title order={5}>Details</Title>
      </Group>

      <Group gap="lg" align="flex-start" wrap="nowrap">
        {/* Left column: the comment log + composer. */}
        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
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
            <ScrollArea maxHeight={300}>
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

        {/* Right column: due date, notification, and assignees. A min height
            gives the panel a consistent floor so it isn't cramped on items with
            few/no comments (the left column drives height once it's taller). */}
        <Stack gap="md" w={220} mih={250}>
          <DatesSection dates={dates} />

          <Stack gap="xs">
            <Text size="xs" fw={600} c="dimmed">
              ASSIGNEES
            </Text>
            <AssigneePicker
              roster={assignees.roster}
              value={assignees.assigneeIds}
              onChange={assignees.onChange}
              onCreate={assignees.onCreate}
            />
          </Stack>
        </Stack>
      </Group>
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

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Button, Group, Stack, Text, Title } from "@mantine/core";
import {
  IconCheck,
  IconGripHorizontal,
  IconListDetails,
  IconPin,
  IconPinFilled,
} from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { type Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import {
  insertDroppedPaths,
  insertPastedFiles,
  pickAndInsert,
  referencedMedia,
  toStoredHtml,
} from "../../lib/media";
import { type CommentsSync, closePanel, emitDetailsAction } from "../../lib/panel";
import { type Assignee, type Comment, type Label } from "../../lib/todos";
import { AssigneePicker, useAssigneeEditor } from "../AssigneePicker";
import { IconButton } from "../IconButton";
import { LabelPicker, useLabelEditor } from "../LabelPicker";
import {
  CommentInput,
  FormatBar,
  htmlIsEmpty,
  useCommentEditor,
} from "../CommentEditor";
import { DiagramModalHost } from "../diagram";
import { ScrollArea } from "../ScrollArea";
import { CommentRow } from "./CommentRow";
import { DatesSection, useDatesEditor } from "./DatesSection";
import { LinksSection } from "./LinksSection";
import { useMediaBusy } from "./useMediaBusy";

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
  /** The list's label roster, to seed the picker's suggestions. */
  labels: Label[];
  /** The item's current label ids. */
  labelIds: string[];
  /** The item's notification time (epoch ms, date + time), if set. */
  notifyAt?: number;
  /** The item's due date (epoch ms at UTC midnight, date only), if set. */
  dueDate?: number;
  /** Epoch ms when the item was created. Absent for legacy items. */
  createdAt?: number;
  /** Epoch ms of the last edit to the item itself (text/state/nesting). */
  updatedAt?: number;
  /** Whether the panel is pinned (owned by PanelHost so it survives re-targeting
   * to another item). */
  pinned: boolean;
  /** Toggle the pin (keeps the panel up across app switches; floats it on top). */
  onTogglePin: () => void;
}

/** A cheap fingerprint of a comment log - changes on any add, delete, or edit -
 * so an inbound sync can be compared to the local log without a deep diff. */
function commentsSig(comments: Comment[]): string {
  return comments.map((c) => `${c.id}:${c.editedAt ?? c.createdAt}`).join("|");
}

/** Compact date + time stamp for the details header (e.g. "Jun 13, 2026, 2:05 PM"). */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Item details, shown in the floating panel pinned below the row. For now this
 * is the comment log - save (⌘/Ctrl+Enter or the Save button), edit, and delete
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
  labels: initialLabels,
  labelIds: initialLabelIds,
  notifyAt: initialNotifyAt,
  dueDate: initialDueDate,
  createdAt,
  updatedAt,
  pinned,
  onTogglePin,
}: ItemDetailsProps) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [draft, setDraft] = useState("");
  const assignees = useAssigneeEditor(itemId, initialRoster, initialAssigneeIds);
  const labels = useLabelEditor(itemId, initialLabels, initialLabelIds);
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
    composerRef.current?.commands.blur();
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

  // Adopt comment-log changes the main window broadcasts for this item (undo/redo,
  // or a delete made elsewhere). A ref holds the latest local log so the
  // register-once listener compares against current state, not its mount-time
  // capture; the signature guard skips echoes of our own edits (same content,
  // fresh array across the process boundary) so it doesn't loop or churn.
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  useEffect(() => {
    const un = listen<CommentsSync>("comments:sync", (e) => {
      const next = e.payload.byItem[itemId];
      if (!next || commentsSig(next) === commentsSig(commentsRef.current)) return;
      setComments(next);
    });
    return () => {
      void un.then((off) => off());
    };
  }, [itemId]);

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

  // Any edit made in this panel (labels, assignees, dates, comments) bumps the
  // store's `updatedAt`, but our `updatedAt` prop is a snapshot from open time -
  // so stamp a local "touched" time too, keeping the header live without a
  // reopen. Skips the first render (mount isn't an edit).
  const [touchedAt, setTouchedAt] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setTouchedAt(Date.now());
  }, [comments, labels.labelIds, assignees.assigneeIds, dates.notifyAt, dates.dueDate]);

  // "Last updated" tracks the latest activity on the item - its own edits plus
  // any comment posts/edits (live, so editing here updates it immediately).
  const lastUpdated = Math.max(
    updatedAt ?? 0,
    createdAt ?? 0,
    touchedAt,
    ...comments.flatMap((c) => [c.createdAt, c.editedAt ?? 0]),
  );

  return (
    <Stack gap="md" w={620}>
      <DiagramModalHost />
      <Group justify="space-between" wrap="nowrap" align="center">
        <Group gap={8} wrap="nowrap" align="center">
          <IconListDetails size={18} stroke={1.8} style={{ display: "block" }} />
          <Title order={5}>Details</Title>
          <IconButton
            label={pinned ? "Unpin panel" : "Pin panel (stays open while you copy from elsewhere)"}
            icon={pinned ? IconPinFilled : IconPin}
            active={pinned}
            onClick={onTogglePin}
          />
          {/* While pinned, a small grab handle lets you slide the floating panel
              out of the way of whatever you're copying from. A leaf drag region
              (the grip is click-through) so the press always lands on it. */}
          {pinned && (
            <Box
              data-tauri-drag-region
              style={{
                width: 22,
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "grab",
                opacity: 0.4,
              }}
            >
              <IconGripHorizontal
                size={16}
                stroke={1.8}
                style={{ display: "block", pointerEvents: "none" }}
              />
            </Box>
          )}
        </Group>
        {(lastUpdated > 0 || createdAt) && (
          <Group gap={8} wrap="nowrap" align="center">
            {lastUpdated > 0 && (
              <Text size="10px" c="dimmed">
                Updated {formatDate(lastUpdated)}
              </Text>
            )}
            {lastUpdated > 0 && createdAt && (
              <Box
                w={1}
                h={10}
                bg="var(--mantine-color-default-border)"
              />
            )}
            {createdAt && (
              <Text size="10px" c="dimmed">
                Created {formatDate(createdAt)}
              </Text>
            )}
          </Group>
        )}
      </Group>

      <Group gap="lg" align="flex-start" wrap="nowrap">
        {/* Left column: the comment log + composer. */}
        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          {/* Heading + composer kept in their own tight stack (gap=6) so the
              label-to-field gap matches NOTIFY's across the column gap; the
              outer stack keeps the looser xs rhythm for the post/list below. */}
          <Stack gap={6}>
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
          </Stack>
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
              leftSection={<IconCheck size={14} stroke={1.8} />}
            >
              Save
            </Button>
          </Group>

          {comments.length > 0 && (
            <ScrollArea
              maxHeight={300}
              style={{ border: "1px solid var(--mantine-color-default-border)" }}
            >
              {/* Newest first; storage stays chronological (new posts append).
                  Padding keeps the comment tiles clear of the bordered, clipped
                  container edges and rounded corners. */}
              <Stack gap={8} p={4}>
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

        {/* Right column: labels, notification, due date, and assignees. A min height
            gives the panel a consistent floor so it isn't cramped on items with
            few/no comments (the left column drives height once it's taller). */}
        <Stack gap="md" w={220} mih={250}>
          <Stack gap="xs">
            <Text size="xs" fw={600} c="dimmed">
              LABELS
            </Text>
            <LabelPicker
              roster={labels.roster}
              value={labels.labelIds}
              onChange={labels.onChange}
              onCreate={labels.onCreate}
            />
          </Stack>

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

          {/* A read-only roll-up of links found in the comments. Comments are
              the source of truth - no separate list. */}
          <LinksSection comments={comments} />
        </Stack>
      </Group>
    </Stack>
  );
}

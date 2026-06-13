import { Box, Button, Group, Stack, Text, Textarea, Title } from "@mantine/core";
import { IconInfoCircle, IconPencil, IconSend, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { closePanel, emitDetailsAction } from "../lib/panel";
import { type Comment } from "../lib/todos";
import { IconButton } from "./IconButton";
import { ScrollArea } from "./ScrollArea";

interface ItemDetailsProps {
  itemId: string;
  /** The item's current comment log, used to seed the editor. */
  comments: Comment[];
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
 * Item details, shown in the floating panel pinned below the row. For now this
 * is the comment log — add (Enter / ⌘+Enter / Post), edit, and delete entries,
 * each timestamped. More detail sections will live here later. The panel owns
 * the editing session and streams the whole updated log back to the main window
 * (which owns the list and autosaves) on each change.
 */
export function ItemDetails({ itemId, comments: initial }: ItemDetailsProps) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Focus the composer when the panel opens.
  useEffect(() => {
    composerRef.current?.focus();
  }, []);

  // Persist a new log to the store (via the main window) and keep it locally.
  const apply = (next: Comment[]) => {
    setComments(next);
    emitDetailsAction({ itemId, comments: next });
  };

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    apply([...comments, { id: crypto.randomUUID(), text, createdAt: Date.now() }]);
    setDraft("");
  };

  const remove = (id: string) => apply(comments.filter((c) => c.id !== id));

  const saveEdit = (id: string, text: string) => {
    const trimmed = text.trim();
    // Clearing the text removes the comment.
    if (!trimmed) return remove(id);
    apply(
      comments.map((c) =>
        c.id === id ? { ...c, text: trimmed, editedAt: Date.now() } : c,
      ),
    );
  };

  return (
    <Stack gap="md" w={300}>
      <Group gap={8} wrap="nowrap">
        <IconInfoCircle size={18} stroke={1.8} />
        <Title order={5}>Details</Title>
      </Group>

      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed">
          COMMENTS
        </Text>

        <Textarea
          ref={composerRef}
          placeholder="Add a comment…"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter (or ⌘/Ctrl+Enter) posts; Shift+Enter inserts a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              post();
            } else if (e.key === "Escape") {
              e.preventDefault();
              closePanel();
            }
          }}
          autosize
          minRows={2}
          maxRows={6}
        />
        <Group justify="flex-end">
          <Button
            size="xs"
            onClick={post}
            disabled={!draft.trim()}
            leftSection={<IconSend size={14} stroke={1.8} />}
          >
            Post
          </Button>
        </Group>

        {comments.length > 0 && (
          <ScrollArea maxHeight={240} radius="var(--mantine-radius-md)">
            {/* Newest first; storage stays chronological (new posts append). */}
            <Stack gap={8} pt={4}>
              {comments
                .slice()
                .reverse()
                .map((c) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    onSave={(text) => saveEdit(c.id, text)}
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
  onSave: (text: string) => void;
  onDelete: () => void;
}

/** One entry in the comment log: timestamped text with hover edit/delete. */
function CommentRow({ comment, onSave, onDelete }: CommentRowProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const [hovered, setHovered] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  if (editing) {
    return (
      <Textarea
        ref={editRef}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSave(text);
            setEditing(false);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setText(comment.text);
            setEditing(false);
          }
        }}
        onBlur={() => {
          onSave(text);
          setEditing(false);
        }}
        autosize
        minRows={1}
        maxRows={6}
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
      <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {comment.text}
      </Text>
      <Group justify="space-between" wrap="nowrap" mt={4} gap={4}>
        <Text size="10px" c="dimmed">
          {formatTime(comment.createdAt)}
          {comment.editedAt ? " · edited" : ""}
        </Text>
        {/* Edit/delete reveal on hover to keep the log uncluttered. */}
        <Group gap={2} wrap="nowrap" style={{ opacity: hovered ? 1 : 0 }}>
          <IconButton label="Edit comment" icon={IconPencil} onClick={() => setEditing(true)} />
          <IconButton label="Delete comment" icon={IconTrash} danger onClick={onDelete} />
        </Group>
      </Group>
    </Box>
  );
}

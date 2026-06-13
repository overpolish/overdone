import { Box, Button, Group, Stack, Text, Title } from "@mantine/core";
import {
  IconCheck,
  IconInfoCircle,
  IconPencil,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";

import { closePanel, emitDetailsAction } from "../lib/panel";
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
 * is the comment log — post (⌘/Ctrl+Enter or the Post button), edit, and delete
 * entries, each timestamped. Comments are rich text (bold / underline / lists).
 * More detail sections will live here later. The panel owns the editing session
 * and streams the whole updated log back to the main window (which owns the list
 * and autosaves) on each change.
 */
export function ItemDetails({ itemId, comments: initial }: ItemDetailsProps) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [draft, setDraft] = useState("");

  // Persist a new log to the store (via the main window) and keep it locally.
  const apply = (next: Comment[]) => {
    setComments(next);
    emitDetailsAction({ itemId, comments: next });
  };

  const post = () => {
    if (htmlIsEmpty(draft)) return;
    apply([...comments, { id: crypto.randomUUID(), text: draft, createdAt: Date.now() }]);
    composer?.commands.clearContent();
    composer?.commands.focus();
    setDraft("");
  };

  const composer = useCommentEditor({
    content: "",
    placeholder: "Add a comment…",
    autoFocus: true,
    onChange: setDraft,
    onSubmit: post,
    onEscape: closePanel,
  });

  const remove = (id: string) => apply(comments.filter((c) => c.id !== id));

  const saveEdit = (id: string, html: string) => {
    // Clearing the text removes the comment.
    if (htmlIsEmpty(html)) return remove(id);
    apply(
      comments.map((c) =>
        c.id === id ? { ...c, text: html, editedAt: Date.now() } : c,
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
        {/* Heading carries the format controls for the composer on its right. */}
        <Group justify="space-between" wrap="nowrap" align="center" h={22}>
          <Text size="xs" fw={600} c="dimmed">
            COMMENTS
          </Text>
          <FormatBar editor={composer} />
        </Group>

        <CommentInput editor={composer} />
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
            <Stack gap={8} pt={4}>
              {comments
                .slice()
                .reverse()
                .map((c) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    onSave={(html) => saveEdit(c.id, html)}
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
  onSave: (html: string) => void;
  onDelete: () => void;
}

/** One entry in the comment log: timestamped rich text with hover edit/delete. */
function CommentRow({ comment, onSave, onDelete }: CommentRowProps) {
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (editing) {
    return (
      <CommentEditView
        comment={comment}
        onSave={(html) => {
          onSave(html);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
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
      {/* The comment's own rich-text HTML, produced by the editor. */}
      <Box
        className="comment-body"
        fz="sm"
        style={{ wordBreak: "break-word" }}
        dangerouslySetInnerHTML={{ __html: comment.text }}
      />
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

interface CommentEditViewProps {
  comment: Comment;
  onSave: (html: string) => void;
  onCancel: () => void;
}

/** Inline editor for an existing comment: input, then format bar + Cancel/Save. */
function CommentEditView({ comment, onSave, onCancel }: CommentEditViewProps) {
  const [draft, setDraft] = useState(comment.text);
  const editor = useCommentEditor({
    content: comment.text,
    autoFocus: true,
    onChange: setDraft,
    onSubmit: () => onSave(draft),
    onEscape: onCancel,
  });

  return (
    <Stack gap={6}>
      <CommentInput editor={editor} />
      <Group justify="space-between" wrap="nowrap">
        <FormatBar editor={editor} />
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

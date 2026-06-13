import { Box, Group } from "@mantine/core";
import {
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconUnderline,
} from "@tabler/icons-react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef } from "react";

import { IconButton } from "./IconButton";

interface UseCommentEditorOptions {
  /** Initial HTML content. */
  content: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Called with the editor's HTML on every change. */
  onChange: (html: string) => void;
  /** Triggered by ⌘/Ctrl+Enter (e.g. post / save). */
  onSubmit?: () => void;
  /** Triggered by Escape (e.g. close / cancel). */
  onEscape?: () => void;
}

/**
 * Create a comment rich-text editor — bold, underline, and bullet/ordered lists
 * (StarterKit bundles the marks/nodes). Content is HTML. ⌘/Ctrl+Enter submits
 * (plain Enter inserts a line / list item). Pair the returned editor with
 * `<FormatBar>` and `<CommentInput>`, placed wherever the layout wants them.
 */
export function useCommentEditor({
  content,
  placeholder,
  autoFocus,
  onChange,
  onSubmit,
  onEscape,
}: UseCommentEditorOptions): Editor | null {
  // Refs so the editor's (once-created) key handler always sees the latest
  // callbacks rather than the ones captured at mount.
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  return useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: placeholder ?? "" })],
    content,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          submitRef.current?.();
          return true;
        }
        if (event.key === "Escape" && escapeRef.current) {
          escapeRef.current();
          return true;
        }
        return false;
      },
    },
  });
}

/** Bold / underline / bullet / ordered-list toggles for a comment editor. */
export function FormatBar({ editor }: { editor: Editor | null }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      bullet: editor?.isActive("bulletList") ?? false,
      ordered: editor?.isActive("orderedList") ?? false,
    }),
  });
  if (!editor) return null;

  return (
    <Group gap={2} wrap="nowrap">
      <IconButton
        label="Bold"
        icon={IconBold}
        active={active?.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <IconButton
        label="Italic"
        icon={IconItalic}
        active={active?.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <IconButton
        label="Underline"
        icon={IconUnderline}
        active={active?.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <IconButton
        label="Bullet list"
        icon={IconList}
        active={active?.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <IconButton
        label="Numbered list"
        icon={IconListNumbers}
        active={active?.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
    </Group>
  );
}

/** The editor's typing surface, styled like a plain text input. */
export function CommentInput({ editor }: { editor: Editor | null }) {
  return (
    <Box className="comment-input">
      <EditorContent editor={editor} />
    </Box>
  );
}

/** Whether editor HTML carries no actual text (so Post/Save should no-op). */
export function htmlIsEmpty(html: string): boolean {
  // Strip tags, drop non-breaking spaces, then check for any remaining text.
  return html.replace(/<[^>]*>/g, "").replace(/ /g, "").trim() === "";
}

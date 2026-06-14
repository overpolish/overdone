/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, Loader, Text } from "@mantine/core";
import {
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconSitemap,
  IconUnderline,
} from "@tabler/icons-react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef } from "react";

import { Attachment } from "../lib/attachment";
import { Mermaid } from "../lib/mermaid-node";
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
  /** Pasted image/video blobs (clipboard), if the host imports attachments. */
  onPasteFiles?: (files: File[]) => void;
}

/**
 * Create a comment rich-text editor - bold, underline, and bullet/ordered lists
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
  onPasteFiles,
}: UseCommentEditorOptions): Editor | null {
  // Refs so the editor's (once-created) handlers always see the latest
  // callbacks rather than the ones captured at mount.
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  const pasteRef = useRef(onPasteFiles);
  pasteRef.current = onPasteFiles;

  return useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Attachment,
      Mermaid,
    ],
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
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
        );
        if (files.length && pasteRef.current) {
          pasteRef.current(files);
          return true;
        }
        return false;
      },
    },
  });
}

/** Bold / underline / bullet / ordered-list toggles for a comment editor. */
export function FormatBar({
  editor,
  onAddMedia,
}: {
  editor: Editor | null;
  /** When set, shows an image/video insert button (opens the file picker). */
  onAddMedia?: () => void;
}) {
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
      <IconButton
        label="Insert diagram"
        icon={IconSitemap}
        onClick={() => editor.chain().focus().insertMermaid().run()}
      />
      {onAddMedia && (
        <IconButton label="Insert image or video" icon={IconPhoto} onClick={onAddMedia} />
      )}
    </Group>
  );
}

/** The editor's typing surface, styled like a plain text input. With `busy`,
 * shows a blocking overlay (e.g. while an attachment imports/compresses). */
export function CommentInput({
  editor,
  busy,
  busyLabel,
}: {
  editor: Editor | null;
  busy?: boolean;
  busyLabel?: string;
}) {
  return (
    <Box className="comment-input" style={{ position: "relative" }}>
      <EditorContent editor={editor} />
      {busy && (
        <Group
          gap={8}
          justify="center"
          style={{
            position: "absolute",
            inset: 0,
            background: "color-mix(in srgb, var(--mantine-color-body) 72%, transparent)",
            backdropFilter: "blur(1px)",
            borderRadius: "var(--mantine-radius-md)",
          }}
        >
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            {busyLabel ?? "Working…"}
          </Text>
        </Group>
      )}
    </Box>
  );
}

/** Whether editor HTML carries no content (so Post/Save should no-op). */
export function htmlIsEmpty(html: string): boolean {
  // An embedded attachment or diagram counts as content on its own.
  if (/<(?:img|video)\b/i.test(html)) return false;
  if (/data-mermaid/i.test(html)) return false;
  // Otherwise strip tags, drop non-breaking spaces, and check for any text.
  return html.replace(/<[^>]*>/g, "").replace(/ /g, "").trim() === "";
}

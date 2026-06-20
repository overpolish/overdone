/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, Loader, Text } from "@mantine/core";
import {
  IconBold,
  IconCode,
  IconCodeDots,
  IconItalic,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconSitemap,
  IconTable,
  IconUnderline,
} from "@tabler/icons-react";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";

import { Attachment } from "../../lib/attachment";
import { usePanelGuard } from "../../lib/panel-guard";
import { Mermaid } from "../../lib/mermaid-node";
import { CodeBlock } from "./CodeBlockNode";
import { LinkBubble, LinkButton } from "./LinkEditor";
import { TableControls, insertDefaultTable, tableExtensions } from "./table";
import { IconButton } from "../ui/IconButton";

interface UseCommentEditorOptions {
  /** Initial HTML content. */
  content: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Hold the floating panel open while this editor has focus, so you can click
   * out to another app to copy something into the comment without the panel
   * dismissing (it also floats on top). Only for editors that live in the panel
   * window; leave off for the scratchpad and other windows. */
  holdPanelOpen?: boolean;
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
  holdPanelOpen,
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

  const editor = useEditor({
    extensions: [
      // Use our own link mark, not StarterKit's: the bundled one ties `inclusive`
      // to `autolink`, so enabling autolink makes the mark inclusive and typing
      // next to a link gets swallowed into it. Force inclusive off so text typed
      // at either boundary stays outside the link. Click-to-open is off (links
      // open via the bubble / Links section); autolink wraps pasted/typed URLs.
      // Replace StarterKit's plain code block with our lowlight one (live syntax
      // highlighting + an in-block language field; inline `code` stays
      // StarterKit's). Highlighting is rendered as editor decorations, so the
      // stored HTML stays clean `<pre><code>`.
      StarterKit.configure({ link: false, codeBlock: false }),
      CodeBlock,
      Link.extend({ inclusive: () => false }).configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Attachment,
      Mermaid,
      ...tableExtensions,
    ],
    content,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    // While focused, hold the panel open (survives an app switch to copy
    // something in) and show its drag grip. On blur, only release when focus
    // stayed within the app - an app switch surfaces as a blur on some platforms
    // but `hasFocus` is then false, so the hold persists until you come back and
    // move focus in-panel.
    onFocus: holdPanelOpen ? () => usePanelGuard.getState().setEditing(true) : undefined,
    onBlur: holdPanelOpen
      ? () => {
          if (document.hasFocus()) usePanelGuard.getState().setEditing(false);
        }
      : undefined,
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

  // Release the hold if this editor unmounts while still focused - an inline
  // comment edit saved with ⌘Enter unmounts before any blur fires, which would
  // otherwise leave the panel stuck open. Panel close clears it backend-side too.
  useEffect(() => {
    if (!holdPanelOpen) return;
    return () => usePanelGuard.getState().setEditing(false);
  }, [holdPanelOpen]);

  return editor;
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
      code: editor?.isActive("code") ?? false,
      codeBlock: editor?.isActive("codeBlock") ?? false,
      link: editor?.isActive("link") ?? false,
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
        label="Inline code"
        icon={IconCode}
        active={active?.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <IconButton
        label="Code block"
        icon={IconCodeDots}
        active={active?.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <LinkButton editor={editor} active={active?.link} />
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
      <IconButton label="Insert table" icon={IconTable} onClick={() => insertDefaultTable(editor)} />
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
  // Clicking a link in the editor shouldn't follow it (WKWebView navigates the
  // webview by default). Guard the real click event in the capture phase - but
  // cancelling the default also stops the caret from landing, so place it
  // ourselves from the click point. That keeps the link as editable text and
  // re-triggers the floating bubble (open / edit / unlink).
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest("a[href]")) return;
      e.preventDefault();
      const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (pos) editor.chain().focus().setTextSelection(pos.pos).run();
    };
    dom.addEventListener("click", onClick, true);
    return () => dom.removeEventListener("click", onClick, true);
  }, [editor]);

  return (
    <Box className="comment-input" style={{ position: "relative" }}>
      <EditorContent editor={editor} />
      {editor && <LinkBubble editor={editor} />}
      {editor && <TableControls editor={editor} />}
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

/** Whether editor HTML carries no content (so Save should no-op). */
export function htmlIsEmpty(html: string): boolean {
  // An embedded attachment or diagram counts as content on its own.
  if (/<(?:img|video|table)\b/i.test(html)) return false;
  if (/data-mermaid/i.test(html)) return false;
  // Otherwise strip tags, drop non-breaking spaces, and check for any text.
  return html.replace(/<[^>]*>/g, "").replace(/ /g, "").trim() === "";
}

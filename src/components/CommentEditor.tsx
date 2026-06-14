/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Button, Group, Loader, Paper, Popover, Stack, Text, TextInput } from "@mantine/core";
import {
  IconBold,
  IconExternalLink,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconPencil,
  IconPhoto,
  IconSitemap,
  IconUnderline,
  IconUnlink,
} from "@tabler/icons-react";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";

import { Attachment } from "../lib/attachment";
import { normalizeUrl, openExternal } from "../lib/links";
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
      // Use our own link mark, not StarterKit's: the bundled one ties `inclusive`
      // to `autolink`, so enabling autolink makes the mark inclusive and typing
      // next to a link gets swallowed into it. Force inclusive off so text typed
      // at either boundary stays outside the link. Click-to-open is off (links
      // open via the bubble / Links section); autolink wraps pasted/typed URLs.
      StarterKit.configure({ link: false }),
      Link.extend({ inclusive: () => false }).configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      }),
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
      {onAddMedia && (
        <IconButton label="Insert image or video" icon={IconPhoto} onClick={onAddMedia} />
      )}
    </Group>
  );
}

/** Select the link mark under the caret (so an edit replaces it rather than
 * stacking a second link) and read back its text + href to seed the form. */
function selectAndReadLink(editor: Editor): { text: string; url: string } {
  if (editor.isActive("link")) editor.chain().focus().extendMarkRange("link").run();
  const { from, to } = editor.state.selection;
  return {
    text: editor.state.doc.textBetween(from, to),
    url: (editor.getAttributes("link").href as string) ?? "",
  };
}

/** Apply a text + URL pair to the current selection: clear the link if the URL
 * is blank/invalid, re-href an unchanged selection in place, or otherwise drop
 * in (replace with) the linked label. Assumes the link range is already
 * selected (see {@link selectAndReadLink}). */
function applyLink(editor: Editor, text: string, url: string): void {
  const href = normalizeUrl(url);
  const chain = editor.chain().focus().extendMarkRange("link");
  if (!href) {
    // No (valid) URL: strip the link but keep its text in place.
    chain.unsetLink().run();
    return;
  }
  const label = text.trim() || href;
  const { from, to } = editor.state.selection;
  const current = editor.state.doc.textBetween(from, to);
  if (from !== to && label === current) {
    // Text unchanged: just (re)apply the href to the existing selection.
    chain.setLink({ href }).run();
  } else {
    // New, or text changed: replace the range with the linked label.
    chain
      .insertContent({ type: "text", text: label, marks: [{ type: "link", attrs: { href } }] })
      .run();
  }
}

/** The text + URL editing form, shared by the format-bar button and the link
 * bubble. Seeds from `initial`; Enter applies, Escape cancels. */
function LinkFields({
  initial,
  onApply,
  onCancel,
}: {
  initial: { text: string; url: string };
  onApply: (text: string, url: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial.text);
  const [url, setUrl] = useState(initial.url);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onApply(text, url);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <Stack gap={6} w={240}>
      <TextInput
        size="xs"
        autoFocus
        placeholder="https://…"
        value={url}
        leftSection={<IconLink size={14} stroke={1.8} />}
        onChange={(e) => setUrl(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <Group gap={6} wrap="nowrap">
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          placeholder="Text (optional)"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <Button size="xs" onClick={() => onApply(text, url)}>
          {url.trim() ? "Apply" : "Remove"}
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * Format-bar control for adding/editing a hyperlink. Opens a popover with the
 * shared {@link LinkFields} form (WKWebView's native `window.prompt` is
 * unreliable). Mainly for turning a selection into a link; links that already
 * exist are more easily edited via the {@link LinkBubble} that floats over them.
 */
function LinkButton({ editor, active }: { editor: Editor; active?: boolean }) {
  const [opened, setOpened] = useState(false);
  const [initial, setInitial] = useState({ text: "", url: "" });

  const open = () => {
    setInitial(selectAndReadLink(editor));
    setOpened(true);
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom" withArrow trapFocus>
      <Popover.Target>
        <Box style={{ display: "flex" }}>
          <IconButton label="Link" icon={IconLink} active={active || opened} onClick={open} />
        </Box>
      </Popover.Target>
      <Popover.Dropdown p={6}>
        <LinkFields
          initial={initial}
          onApply={(text, url) => {
            applyLink(editor, text, url);
            setOpened(false);
          }}
          onCancel={() => setOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * A small toolbar that floats over the link under the caret (Reddit-style), so
 * a link can be opened, edited, or unlinked without clicking it (which would
 * just follow it). Edit swaps the toolbar for the {@link LinkFields} form. Shown
 * whenever a link is active - independent of editor focus - so interacting with
 * its inputs doesn't dismiss it.
 */
function LinkBubble({ editor }: { editor: Editor }) {
  const [editing, setEditing] = useState(false);
  const [initial, setInitial] = useState({ text: "", url: "" });

  const startEdit = () => {
    setInitial(selectAndReadLink(editor));
    setEditing(true);
  };

  return (
    <BubbleMenu
      editor={editor}
      // Append to <body>, not the editor's parent: when editing an existing
      // comment the editor sits inside the comment-log ScrollArea, which clips
      // its overflow and would hide the bubble. Floating UI still positions it
      // against the selection, and it stays within the window.
      appendTo={() => document.body}
      // Float above the composer's controls (e.g. the Post button), which would
      // otherwise paint over the bubble since they come later in the DOM.
      style={{ zIndex: "var(--mantine-z-index-max)" }}
      // Re-evaluated on every transaction; stay up while a link is active even
      // when focus moves to the form's inputs (so editing doesn't dismiss it).
      shouldShow={({ editor }) => editor.isActive("link")}
      // flip/shift keep it inside the (small) panel window rather than clipping.
      // onShow resets to the toolbar (not the form) each time it re-appears.
      options={{
        placement: "bottom",
        offset: 6,
        flip: true,
        shift: true,
        onShow: () => setEditing(false),
      }}
    >
      <Paper withBorder shadow="md" radius="md" p={editing ? 6 : 2}>
        {editing ? (
          <LinkFields
            initial={initial}
            onApply={(text, url) => {
              applyLink(editor, text, url);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <Group gap={2} wrap="nowrap">
            <IconButton
              label="Open link"
              icon={IconExternalLink}
              onClick={() => void openExternal((editor.getAttributes("link").href as string) ?? "")}
            />
            <IconButton label="Edit link" icon={IconPencil} onClick={startEdit} />
            <IconButton
              label="Remove link"
              icon={IconUnlink}
              danger
              onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
            />
          </Group>
        )}
      </Paper>
    </BubbleMenu>
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

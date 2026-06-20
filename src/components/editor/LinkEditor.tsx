/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Button, Group, Paper, Popover, Stack, TextInput } from "@mantine/core";
import { IconExternalLink, IconLink, IconPencil, IconUnlink } from "@tabler/icons-react";
import { type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { type KeyboardEvent as ReactKeyboardEvent, useState } from "react";

import { normalizeUrl, openExternal } from "../../lib/links";
import { IconButton } from "../ui/IconButton";

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
export function LinkButton({ editor, active }: { editor: Editor; active?: boolean }) {
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
export function LinkBubble({ editor }: { editor: Editor }) {
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
      // Float above the composer's controls (e.g. the Save button), which would
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
              radius="sm"
              onClick={() => void openExternal((editor.getAttributes("link").href as string) ?? "")}
            />
            <IconButton label="Edit link" icon={IconPencil} radius="sm" onClick={startEdit} />
            <IconButton
              label="Remove link"
              icon={IconUnlink}
              danger
              radius="sm"
              onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
            />
          </Group>
        )}
      </Paper>
    </BubbleMenu>
  );
}

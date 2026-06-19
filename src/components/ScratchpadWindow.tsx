/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, Stack, Text, Title } from "@mantine/core";
import { IconNote, IconX } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { DOMSerializer } from "@tiptap/pm/model";
import { type Editor } from "@tiptap/react";
import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  insertDroppedPaths,
  insertPastedFiles,
  pickAndInsert,
  referencedMedia,
  toDisplayHtml,
  toStoredHtml,
} from "../lib/media";
import {
  closeScratchpad,
  emitScratchpadConvert,
  SCRATCHPAD_MEDIA_ID,
  scratchpadLines,
  useScratchpad,
} from "../lib/scratchpad";
import { buildConvertedItem } from "../lib/scratchpad-convert";
import { CommentInput, FormatBar, useCommentEditor } from "./CommentEditor";
import { DiagramModalHost } from "./diagram";
import { IconButton } from "./IconButton";
import { ScratchpadConvertMenu } from "./ScratchpadConvertMenu";
import { useMediaBusy } from "./details/useMediaBusy";

/**
 * The scratchpad's own window: a persistent, freely-resizable rich-text pad for
 * quick notes that aren't tasks yet. It reuses the comment editor (same toolbar +
 * image/video support) and, unlike the popover panel, stays visible while the
 * panel (comments, settings, lists) is also open. Select lines and right-click to
 * turn them into a list item: the first line becomes the item, the rest (extra
 * lines and any images) becomes its first comment.
 *
 * Resolves the media folder before mounting the editor (so existing attachments
 * seed with working URLs), then renders the body keyed by it.
 */
export function ScratchpadWindow() {
  const [mediaDir, setMediaDir] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        setMediaDir(await join(await appDataDir(), "media", SCRATCHPAD_MEDIA_ID));
      } catch {
        setMediaDir("");
      }
    })();
  }, []);

  return (
    <Box
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--mantine-color-body)",
      }}
    >
      {mediaDir !== null && <ScratchpadBody mediaDir={mediaDir} />}
    </Box>
  );
}

/** Serialize the editor's current selection to HTML (display form). */
function serializeSelection(editor: Editor): string {
  const slice = editor.state.selection.content();
  const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content);
  const div = document.createElement("div");
  div.appendChild(fragment);
  return div.innerHTML;
}

function ScratchpadBody({ mediaDir }: { mediaDir: string }) {
  const { busy, busyLabel, error, run } = useMediaBusy();
  const editorRef = useRef<Editor | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Canonical stored HTML lives in the store; the editor speaks display HTML.
  const prevStoredRef = useRef(useScratchpad.getState().text);
  // Set for the convert edit so the move's attachments aren't deleted here while
  // the main window copies them into the list (the scratchpad copies are pruned
  // on the next open instead).
  const skipCleanupRef = useRef(false);

  const onChange = (html: string) => {
    const stored = toStoredHtml(html);
    if (skipCleanupRef.current) {
      skipCleanupRef.current = false;
    } else {
      const after = new Set(referencedMedia([stored]));
      const removed = referencedMedia([prevStoredRef.current]).filter((f) => !after.has(f));
      if (removed.length) void invoke("delete_attachments", { listId: SCRATCHPAD_MEDIA_ID, files: removed });
    }
    prevStoredRef.current = stored;
    useScratchpad.getState().setText(stored);
  };

  const editor = useCommentEditor({
    content: toDisplayHtml(useScratchpad.getState().text, mediaDir),
    placeholder: "Jot quick notes here…",
    autoFocus: true,
    onChange,
    onEscape: closeScratchpad,
    onPasteFiles: (files) => {
      const ed = editorRef.current;
      if (ed) run(() => insertPastedFiles(ed, SCRATCHPAD_MEDIA_ID, mediaDir, files));
    },
  });
  editorRef.current = editor;

  // Clear scratchpad attachments orphaned by a previous session, mirroring list
  // open (the edit-time cleanup only covers the current session).
  useEffect(() => {
    void invoke("prune_media", {
      listId: SCRATCHPAD_MEDIA_ID,
      keep: referencedMedia([useScratchpad.getState().text]),
    });
  }, []);

  // Reopening the window puts the caret back at the end of the notes.
  useEffect(() => {
    const un = listen("scratchpad:shown", () => editorRef.current?.commands.focus("end"));
    return () => {
      void un.then((off) => off());
    };
  }, []);

  // OS file drops arrive as paths (Tauri intercepts them) → insert in the editor.
  useEffect(() => {
    let off: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type !== "drop") return;
        const { paths } = e.payload;
        const ed = editorRef.current;
        if (ed) run(() => insertDroppedPaths(ed, SCRATCHPAD_MEDIA_ID, mediaDir, paths));
      })
      .then((f) => (off = f));
    return () => off?.();
  }, [mediaDir, run]);

  // Right-click over a non-empty selection offers to convert it into an item.
  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    const ed = editorRef.current;
    if (!ed || ed.state.selection.empty) return;
    const { from, to } = ed.state.selection;
    const text = ed.state.doc.textBetween(from, to, "\n", "\n");
    if (scratchpadLines(text).length === 0) return;
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const convert = () => {
    setMenu(null);
    const ed = editorRef.current;
    if (!ed || ed.state.selection.empty) return;
    const { from, to } = ed.state.selection;
    const text = ed.state.doc.textBetween(from, to, "\n", "\n");
    const built = buildConvertedItem(text, serializeSelection(ed));
    if (!built) return;

    emitScratchpadConvert({ ...built, mediaDir });

    // Remove the converted selection without deleting its (now being-copied) media.
    skipCleanupRef.current = true;
    ed.chain().focus().deleteSelection().run();
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <DiagramModalHost />
      {/* The whole top bar - its padding included - drags the window (scratchpad
          only). The title is pointer-events: none so a press there falls through
          to the drag region; the close button keeps its events, so it's clickable. */}
      <Group
        data-tauri-drag-region
        justify="space-between"
        wrap="nowrap"
        align="center"
        px="md"
        pt="md"
        pb="sm"
        style={{ cursor: "grab" }}
      >
        <Group gap={8} wrap="nowrap" style={{ pointerEvents: "none" }}>
          <IconNote size={18} stroke={1.8} style={{ display: "block" }} />
          <Title order={5}>Scratchpad</Title>
        </Group>
        <IconButton label="Close scratchpad" icon={IconX} onClick={closeScratchpad} danger />
      </Group>

      <Stack gap="sm" px="md" pb="md" style={{ flex: 1, minHeight: 0 }}>
        <FormatBar
          editor={editor}
          onAddMedia={() => editor && run(() => pickAndInsert(editor, SCRATCHPAD_MEDIA_ID, mediaDir))}
        />

        <div className="scratchpad-editor" onContextMenu={onContextMenu} style={{ flex: 1, minHeight: 0 }}>
          <CommentInput editor={editor} busy={busy} busyLabel={busyLabel} />
        </div>

        {error ? (
          <Text size="xs" c="red">
            {error}
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            Select lines and right-click to turn them into an item.
          </Text>
        )}
      </Stack>

      {menu && (
        <ScratchpadConvertMenu
          x={menu.x}
          y={menu.y}
          onConvert={convert}
          onClose={() => setMenu(null)}
        />
      )}
    </Box>
  );
}

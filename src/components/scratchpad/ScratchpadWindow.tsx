/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, Stack, Text, Title } from "@mantine/core";
import { IconNote, IconX } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
} from "../../lib/media";
import { useLists } from "../../lib/lists";
import {
  closeScratchpad,
  emitScratchpadConvert,
  scratchpadLines,
  loadScratchpadRect,
  saveScratchpadRect,
  scratchpadMediaId,
  scratchpadText,
  useScratchpad,
} from "../../lib/scratchpad";
import { buildConvertedItem } from "../../lib/scratchpad-convert";
import { CommentInput, FormatBar, useCommentEditor } from "../editor/CommentEditor";
import { DiagramModalHost } from "../diagram";
import { IconButton } from "../ui/IconButton";
import { ScratchpadConvertMenu } from "./ScratchpadConvertMenu";
import { ScrollArea } from "../ui/ScrollArea";
import { useMediaBusy } from "../details/useMediaBusy";

// TEMP(demo): example note shown when a list's scratchpad is empty, so it isn't
// blank for screenshots. Dev-only. Remove this constant and its use below once
// the screenshots are captured.
const DEMO_SCRATCHPAD_NOTE = `<h2>Launch week standup</h2><p>Quick notes pad - tables and code render here just like in item comments.</p><ul><li>Embargo lifts <strong>09:00 PT</strong> Thursday</li><li>Firefox pricing bug is the last <em>P1</em> blocker</li><li>Re-scan booked for Friday AM</li></ul><p>Capacity this week:</p><table><colgroup><col style="width: 40%"><col style="width: 30%"><col style="width: 30%"></colgroup><tr><th>Owner</th><th>Focus</th><th>Status</th></tr><tr><td>Alice</td><td>Landing page</td><td data-cell-bg="#fff3bf">in progress</td></tr><tr><td>Bob</td><td>Analytics + security</td><td data-cell-bg="#ffc9c9">blocked</td></tr><tr><td>Cara</td><td>Pricing table</td><td data-cell-bg="#d3f9d8">on track</td></tr></table><p>One-liner to tail the collector while testing:</p><pre><code class="language-bash">wrangler tail launch-collector --format pretty | grep -i signup</code></pre><p>Paste anything here while you work; it is saved per list automatically.</p>`;

/**
 * The scratchpad's own window: a persistent, freely-resizable rich-text pad for
 * quick notes that aren't tasks yet. It reuses the comment editor (same toolbar +
 * image/video support) and, unlike the popover panel, stays visible while the
 * panel (comments, settings, lists) is also open. Select lines and right-click to
 * turn them into a list item: the first line becomes the item, the rest (extra
 * lines and any images) becomes its first comment.
 *
 * The scratchpad is per-list: it shows the active list's note (the active list is
 * mirrored across windows by the lists store). Resolves that list's media folder
 * before mounting the editor (so existing attachments seed with working URLs),
 * then renders the body keyed by the list id so switching lists remounts it with
 * the right note + folder.
 */
export function ScratchpadWindow() {
  const activeId = useLists((s) => s.activeId);
  const [mediaDir, setMediaDir] = useState<string | null>(null);
  useEffect(() => {
    setMediaDir(null);
    if (!activeId) return;
    void (async () => {
      try {
        setMediaDir(await join(await appDataDir(), "media", scratchpadMediaId(activeId)));
      } catch {
        setMediaDir("");
      }
    })();
  }, [activeId]);

  // Per-list scratchpad window geometry: each list reopens its scratchpad where
  // it last sat. The window-state plugin still provides a global fallback for a
  // list with no saved spot yet (it restores before this runs; our per-list
  // restore below overrides it when a rect exists).
  const restoringRef = useRef(false);

  // Save (debounced) the window's geometry under whichever list is active. The
  // listeners mount once and capture the active list per move. Suppressed while
  // we're programmatically restoring, so a restore can't overwrite a sibling
  // list's saved spot.
  useEffect(() => {
    const win = getCurrentWindow();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Capture the active list at the moment of the move (debounced), then save its
    // geometry - but only if that list is still active after the async read, so a
    // move during a list switch can't save one list's spot under another.
    const save = (id: string) => {
      if (restoringRef.current) return;
      void (async () => {
        const [pos, size] = await Promise.all([win.outerPosition(), win.innerSize()]);
        if (restoringRef.current || useLists.getState().activeId !== id) return;
        saveScratchpadRect(id, { x: pos.x, y: pos.y, w: size.width, h: size.height });
      })();
    };
    const schedule = () => {
      const id = useLists.getState().activeId;
      if (!id) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => save(id), 300);
    };
    let offMoved: (() => void) | undefined;
    let offResized: (() => void) | undefined;
    void win.onMoved(schedule).then((off) => (offMoved = off));
    void win.onResized(schedule).then((off) => (offResized = off));
    return () => {
      if (timer) clearTimeout(timer);
      offMoved?.();
      offResized?.();
    };
  }, []);

  // Restore this list's saved geometry when the active list changes (leaving the
  // window where it is when the list has none yet).
  useEffect(() => {
    if (!activeId) return;
    const rect = loadScratchpadRect(activeId);
    if (!rect) return;
    const win = getCurrentWindow();
    restoringRef.current = true;
    void (async () => {
      try {
        await win.setPosition(new PhysicalPosition(rect.x, rect.y));
        await win.setSize(new PhysicalSize(rect.w, rect.h));
      } finally {
        // Let the move/resize events the restore itself fires settle before
        // re-enabling saves, so it doesn't immediately re-save under this list.
        setTimeout(() => {
          restoringRef.current = false;
        }, 250);
      }
    })();
  }, [activeId]);

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
      {activeId && mediaDir !== null && (
        <ScratchpadBody key={activeId} listId={activeId} mediaDir={mediaDir} />
      )}
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

/**
 * Whether the selection is nothing but code block(s) - no prose to become an
 * item's title. A code block can't be an item, so the convert action is disabled
 * for such a selection. (Inline code inside a normal line is fine - that line can
 * still be a title.)
 */
function selectionIsOnlyCode(editor: Editor): boolean {
  const { from, to } = editor.state.selection;
  let hasCode = false;
  let hasProse = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === "codeBlock") {
      hasCode = true;
      return false; // its text isn't prose - don't descend
    }
    if (node.isText && (node.text ?? "").trim()) hasProse = true;
    return true;
  });
  return hasCode && !hasProse;
}

function ScratchpadBody({ listId, mediaDir }: { listId: string; mediaDir: string }) {
  const { busy, busyLabel, error, run } = useMediaBusy();
  const editorRef = useRef<Editor | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; canConvert: boolean } | null>(null);
  // This list's scratchpad attachments live in their own media folder.
  const mediaId = scratchpadMediaId(listId);

  // Canonical stored HTML lives in the store; the editor speaks display HTML.
  const prevStoredRef = useRef(scratchpadText(listId));
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
      if (removed.length) void invoke("delete_attachments", { listId: mediaId, files: removed });
    }
    prevStoredRef.current = stored;
    useScratchpad.getState().setText(listId, stored);
  };

  const editor = useCommentEditor({
    // TEMP(demo): fall back to an example note when empty (dev only) for
    // screenshots. Restore to `scratchpadText(listId)` after capturing them.
    content: toDisplayHtml(
      scratchpadText(listId) || (import.meta.env.DEV ? DEMO_SCRATCHPAD_NOTE : ""),
      mediaDir,
    ),
    placeholder: "Jot quick notes here…",
    autoFocus: true,
    onChange,
    onEscape: closeScratchpad,
    onPasteFiles: (files) => {
      const ed = editorRef.current;
      if (ed) run(() => insertPastedFiles(ed, mediaId, mediaDir, files));
    },
  });
  editorRef.current = editor;

  // Clear scratchpad attachments orphaned by a previous session, mirroring list
  // open (the edit-time cleanup only covers the current session).
  useEffect(() => {
    void invoke("prune_media", {
      listId: mediaId,
      keep: referencedMedia([scratchpadText(listId)]),
    });
  }, [mediaId, listId]);

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
        if (ed) run(() => insertDroppedPaths(ed, mediaId, mediaDir, paths));
      })
      .then((f) => (off = f));
    return () => off?.();
  }, [mediaId, mediaDir, run]);

  // Right-click over a non-empty selection offers to convert it into an item;
  // a code-block-only selection shows the action disabled (it can't be a title).
  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    const ed = editorRef.current;
    if (!ed || ed.state.selection.empty) return;
    const { from, to } = ed.state.selection;
    const text = ed.state.doc.textBetween(from, to, "\n", "\n");
    if (scratchpadLines(text).length === 0) return;
    setMenu({ x: e.clientX, y: e.clientY, canConvert: !selectionIsOnlyCode(ed) });
  };

  const convert = () => {
    setMenu(null);
    const ed = editorRef.current;
    if (!ed || ed.state.selection.empty || selectionIsOnlyCode(ed)) return;
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
          onAddMedia={() => editor && run(() => pickAndInsert(editor, mediaId, mediaDir))}
        />

        <div
          className="scratchpad-editor"
          onContextMenu={onContextMenu}
          style={{ flex: 1, minHeight: 0 }}
        >
          <ScrollArea radius={0} style={{ flex: 1, minHeight: 0 }}>
            <CommentInput editor={editor} busy={busy} busyLabel={busyLabel} />
          </ScrollArea>
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
          canConvert={menu.canConvert}
          onConvert={convert}
          onClose={() => setMenu(null)}
        />
      )}
    </Box>
  );
}

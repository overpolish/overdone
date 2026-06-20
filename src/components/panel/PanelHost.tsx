/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Button, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { emitEditAction, type PanelRequest } from "../../lib/panel";
import { type PanelAction, usePanelGuard } from "../../lib/panel-guard";
import { AssigneePanel } from "./AssigneePanel";
import { DailyReview } from "./DailyReview";
import { closeDiagramModal, useDiagramModalOpen } from "../diagram";
import { ItemDetails } from "../details";
import { Filter } from "./Filter";
import { Lists } from "./Lists";
import { Search } from "./Search";
import { Settings } from "../settings";
import { StatusPicker } from "./StatusPicker";
import { UpdatePanel } from "../update/UpdatePanel";
import { ScrollArea } from "../ui/ScrollArea";

/** Round up the content's rendered size to whole logical pixels. */
function measure(el: HTMLElement): { width: number; height: number } {
  const r = el.getBoundingClientRect();
  return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
}

function renderView(request: PanelRequest | null) {
  if (!request) return null;
  switch (request.view) {
    case "lists":
      return <Lists />;
    case "search":
      // Keyed by nonce so each open starts with a fresh query + autofocus.
      return (
        <Search
          key={request.nonce}
          items={request.items ?? []}
          labels={request.labels ?? []}
          assignees={request.roster ?? []}
          revealedId={request.revealedId}
        />
      );
    case "filter":
      // Keyed by nonce so re-opening re-runs the panel's mount effects.
      return (
        <Filter
          key={request.nonce}
          listId={request.listId ?? ""}
          labels={request.labels ?? []}
          assignees={request.roster ?? []}
        />
      );
    case "status":
      return request.itemId && request.state ? (
        <StatusPicker itemId={request.itemId} state={request.state} />
      ) : null;
    case "details":
      // Keyed by nonce so re-opening re-seeds the editor with the latest log.
      return request.itemId ? (
        <ItemDetails
          key={request.nonce}
          itemId={request.itemId}
          comments={request.comments ?? []}
          listId={request.listId ?? ""}
          mediaDir={request.mediaDir ?? ""}
          roster={request.roster ?? []}
          assigneeIds={request.assigneeIds ?? []}
          labels={request.labels ?? []}
          labelIds={request.labelIds ?? []}
          notifyAt={request.notifyAt}
          dueDate={request.dueDate}
          createdAt={request.createdAt}
          updatedAt={request.updatedAt}
        />
      ) : null;
    case "assignee":
      return request.itemId ? (
        <AssigneePanel
          key={request.nonce}
          itemId={request.itemId}
          roster={request.roster ?? []}
          assigneeIds={request.assigneeIds ?? []}
        />
      ) : null;
    case "dailyReview":
      // Keyed by nonce so each open restarts the stack from a fresh snapshot.
      return (
        <DailyReview
          key={request.nonce}
          queue={request.reviewQueue ?? []}
          listId={request.listId ?? ""}
          mediaDir={request.mediaDir ?? ""}
          roster={request.roster ?? []}
        />
      );
    case "update":
      return <UpdatePanel version={request.updateVersion ?? ""} notes={request.updateNotes} />;
    case "settings":
    default:
      return (
        <Settings
          key={request.nonce}
          roster={request.roster ?? []}
          labels={request.labels ?? []}
        />
      );
  }
}

/**
 * Renders the panel window's content and keeps the OS window sized to it. The
 * main window emits `panel:open` with the view (and, for the status picker, the
 * item context + anchor); we render it, measure, and ask the backend to size +
 * position + show the window. While open, a ResizeObserver keeps the window
 * fitted as content changes (e.g. lists added/removed).
 */
export function PanelHost() {
  const [request, setRequest] = useState<PanelRequest | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // A parked dismissal (close / swap to another item) waiting on the
  // unsaved-comment prompt; null when there's nothing to confirm.
  const pending = usePanelGuard((s) => s.pending);
  // The in-panel diagram modal needs more room than the ~340px details panel; while
  // it's open, grow the panel window ~2x (centered) and restore it on close.
  const diagramOpen = useDiagramModalOpen();
  const wasExpanded = useRef(false);

  // Receive open requests from the main window. If the current view has an
  // unsaved comment, the guard parks the swap behind the prompt instead of
  // letting it replace the draft; otherwise it's applied straight away.
  useEffect(() => {
    const unlisten = listen<PanelRequest>("panel:open", (e) => {
      if (!usePanelGuard.getState().request({ type: "open", request: e.payload })) {
        setRequest(e.payload);
      }
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // The backend asks to confirm before dismissing a panel with an unsaved comment
  // (clicking the main window, focusing the scratchpad). The guard parks the
  // close behind the prompt; if there's nothing unsaved, just close.
  useEffect(() => {
    const unlisten = listen("panel:confirm-close", () => {
      if (!usePanelGuard.getState().request({ type: "close" })) {
        void invoke("close_panel");
      }
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // The panel closed (blur-dismiss, Escape, status pick): clear any guard state
  // so the next open starts clean.
  useEffect(() => {
    const unlisten = listen("panel:closed", () => usePanelGuard.getState().reset());
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Cmd/Ctrl+Z/Y in a panel can't reach the main window's store, so forward it
  // (e.g. undoing an assignee change made here). Skip when a text field is
  // focused so its native text undo still works.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      e.preventDefault();
      emitEditAction(key === "y" || e.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Each new request: measure the freshly-rendered view and open at that size.
  useLayoutEffect(() => {
    if (!request || !ref.current) return;
    const { width, height } = measure(ref.current);
    void invoke("open_panel", {
      width,
      height,
      anchorX: request.anchor?.x ?? null,
      anchorY: request.anchor?.y ?? null,
    });
  }, [request]);

  // The panel dismisses itself on blur (handled natively); close the diagram
  // modal too, so it doesn't linger (and re-show) the next time the panel opens.
  useEffect(() => {
    const off = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) closeDiagramModal();
    });
    return () => {
      void off.then((f) => f());
    };
  }, []);

  // Grow the panel window ~2x (centered) while the diagram modal is open, and
  // restore it on close. The base content size stays ~340px (the modal renders
  // in a portal, outside the measured content), so this never fights the
  // content-fit ResizeObserver below.
  useEffect(() => {
    if (wasExpanded.current === diagramOpen || !ref.current) return;
    wasExpanded.current = diagramOpen;
    const { width, height } = measure(ref.current);
    void invoke("set_panel_expanded", { expanded: diagramOpen, width, height });
  }, [diagramOpen]);

  // Keep the window fitted while it's open and its content changes.
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => {
      if (!ref.current) return;
      const { width, height } = measure(ref.current);
      if (width <= 1 || height <= 1) return;
      void invoke("resize_panel", { width, height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // Resolve the unsaved-comment prompt. The active view registered how to save /
  // discard its draft; once that's done, run whatever dismissal was parked.
  const runPending = (action: PanelAction) => {
    if (action.type === "close") void invoke("close_panel");
    else setRequest(action.request);
  };
  const onCancel = () => usePanelGuard.getState().clearPending();
  const onDiscard = () => {
    const g = usePanelGuard.getState();
    g.discard();
    g.clearPending();
    if (pending) runPending(pending);
  };
  const onSaveClose = () => {
    const g = usePanelGuard.getState();
    g.save();
    g.clearPending();
    if (pending) runPending(pending);
  };

  return (
    // Shrink-wrap to the content (each view sets its own width) so the measured
    // size drives the window size; `width: max-content` reads through the
    // ScrollArea to the inner content. The ScrollArea caps the height to the
    // screen's work area and scrolls any overflow inside with the app's overlay
    // scrollbar + fade shadows, so a tall panel (long lists, full settings) can't
    // grow past the screen: the backend only repositions an over-tall window, it
    // never shrinks it. `vh` is useless here since the webview viewport is itself
    // the content-sized window, so use the screen. The padding lives inside the
    // scroller so it scrolls with the content (as it did when the Box scrolled).
    <Box ref={ref} bg="var(--mantine-color-body)" style={{ width: "max-content" }}>
      <ScrollArea radius={0} maxHeight={window.screen.availHeight - 24}>
        <Box p="md">{renderView(request)}</Box>
      </ScrollArea>

      {/* Unsaved-comment guard: clicking the main window or another item while a
          comment is in progress parks the dismissal here and asks first, rather
          than throwing the draft away. Fixed so it covers the whole panel; out of
          flow so it doesn't perturb the content-fit measurement. */}
      {pending && (
        <Box
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--mantine-spacing-md)",
            background: "color-mix(in srgb, var(--mantine-color-body) 55%, transparent)",
            backdropFilter: "blur(2px)",
          }}
        >
          <Stack
            gap="sm"
            p="md"
            style={{
              maxWidth: 320,
              borderRadius: "var(--mantine-radius-md)",
              background: "var(--mantine-color-body)",
              border: "1px solid var(--mantine-color-default-border)",
              boxShadow: "var(--mantine-shadow-md)",
            }}
          >
            <Group gap={8} wrap="nowrap" align="flex-start">
              <IconAlertTriangle
                size={18}
                stroke={1.8}
                color="var(--mantine-color-yellow-6)"
                style={{ flexShrink: 0, marginTop: 1 }}
              />
              <Text size="sm">You have unsaved changes. Closing will discard them.</Text>
            </Group>
            <Group justify="flex-end" gap={8} wrap="nowrap">
              <Button size="xs" variant="default" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="xs" variant="subtle" color="red" onClick={onDiscard}>
                Discard
              </Button>
              <Button size="xs" onClick={onSaveClose}>
                Save &amp; close
              </Button>
            </Group>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

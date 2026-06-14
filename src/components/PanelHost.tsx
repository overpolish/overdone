/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { emitEditAction, type PanelRequest } from "../lib/panel";
import { AssigneePanel } from "./AssigneePanel";
import { closeDiagramModal, useDiagramModalOpen } from "./diagram";
import { ItemDetails } from "./details";
import { Lists } from "./Lists";
import { Search } from "./Search";
import { Settings } from "./settings";
import { StatusPicker } from "./StatusPicker";

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
      return <Search key={request.nonce} items={request.items ?? []} />;
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
          notifyAt={request.notifyAt}
          dueDate={request.dueDate}
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
    case "settings":
    default:
      return <Settings key={request.nonce} roster={request.roster ?? []} />;
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
  // The in-panel diagram modal needs more room than the ~340px details panel; while
  // it's open, grow the panel window ~2x (centered) and restore it on close.
  const diagramOpen = useDiagramModalOpen();
  const wasExpanded = useRef(false);

  // Receive open requests from the main window.
  useEffect(() => {
    const unlisten = listen<PanelRequest>("panel:open", (e) =>
      setRequest(e.payload),
    );
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

  return (
    <Box
      ref={ref}
      p="md"
      bg="var(--mantine-color-body)"
      // Shrink-wrap to the content (each view sets its own width) so the
      // measured size drives the window size.
      style={{ width: "max-content" }}
    >
      {renderView(request)}
    </Box>
  );
}

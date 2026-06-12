import { Box } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { type PanelRequest } from "../lib/panel";
import { Lists } from "./Lists";
import { Search } from "./Search";
import { Settings } from "./Settings";
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
    case "settings":
    default:
      return <Settings />;
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

  // Receive open requests from the main window.
  useEffect(() => {
    const unlisten = listen<PanelRequest>("panel:open", (e) =>
      setRequest(e.payload),
    );
    return () => {
      void unlisten.then((off) => off());
    };
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

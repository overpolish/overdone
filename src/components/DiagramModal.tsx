import { Modal } from "@mantine/core";
import {
  IconCheck,
  IconPencil,
  IconX,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";

import { useRenderedSvg } from "../lib/use-mermaid";
import { IconButton } from "./IconButton";

/** Request to open the diagram modal. `onSave` (when given alongside `editable`)
 * persists edited source back wherever the diagram lives. */
export interface OpenDiagram {
  code: string;
  editable?: boolean;
  initialMode?: "view" | "edit";
  onSave?: (code: string) => void;
}

// A global store (not React context) so TipTap node views — which render in a
// separate portal — can open the modal without relying on context propagation.
interface DiagramStore {
  req: OpenDiagram | null;
  openId: number;
  open: (req: OpenDiagram) => void;
  close: () => void;
}
const useDiagramStore = create<DiagramStore>((set) => ({
  req: null,
  openId: 0,
  open: (req) => set((s) => ({ req, openId: s.openId + 1 })),
  close: () => set({ req: null }),
}));

/** Open the shared diagram modal (zoom/pan + split-pane editor). */
export const useDiagramEditor = () => useDiagramStore((s) => s.open);

/** Whether the diagram modal is currently open (drives the panel-window grow). */
export const useDiagramModalOpen = () => useDiagramStore((s) => s.req !== null);

/** Close the diagram modal imperatively (e.g. when the panel itself dismisses). */
export const closeDiagramModal = () => useDiagramStore.getState().close();

/** The single, app-level diagram modal. Render once somewhere always-mounted. */
export function DiagramModalHost() {
  const req = useDiagramStore((s) => s.req);
  const openId = useDiagramStore((s) => s.openId);
  const close = useDiagramStore((s) => s.close);

  return (
    <Modal
      opened={req !== null}
      onClose={close}
      size="auto"
      centered
      withCloseButton={false}
      padding={0}
      styles={{ content: { overflow: "hidden" }, body: { padding: 0 } }}
    >
      {req && <DiagramSurface key={openId} req={req} onClose={close} />}
    </Modal>
  );
}

/** Modal contents: chrome-free, with floating toolbars over the diagram. View is
 * a single zoom/pan canvas; edit is a wider split (source | live preview). Keyed
 * per-open, so state resets each time. */
function DiagramSurface({ req, onClose }: { req: OpenDiagram; onClose: () => void }) {
  const [mode, setMode] = useState<"view" | "edit">(req.initialMode ?? "view");
  const [draft, setDraft] = useState(req.code);
  const canEdit = !!req.editable && !!req.onSave;

  const save = () => {
    req.onSave?.(draft);
    onClose();
  };
  // Cancel returns to view if we came from it; otherwise closes the modal.
  const cancel = () => (req.initialMode === "view" ? setMode("view") : onClose());

  return (
    <div className="diagram-modal-body">
      {mode === "view" ? (
        <ViewPane
          code={req.code}
          onClose={onClose}
          onEdit={
            canEdit
              ? () => {
                  setDraft(req.code);
                  setMode("edit");
                }
              : undefined
          }
        />
      ) : (
        <EditPane draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} />
      )}
    </div>
  );
}

/** Read-only diagram with zoom/pan and a top-left edit/close toolbar. */
function ViewPane({
  code,
  onEdit,
  onClose,
}: {
  code: string;
  onEdit?: () => void;
  onClose: () => void;
}) {
  const { svg, error } = useRenderedSvg(code);
  if (error && !svg) {
    return (
      <div className="diagram-viewport diagram-viewport--message">
        <span className="mermaid-error">{error}</span>
      </div>
    );
  }
  return (
    <PanZoom
      svg={svg}
      topLeft={
        <>
          <IconButton label="Close" icon={IconX} onClick={onClose} />
          {onEdit && <IconButton label="Edit diagram" icon={IconPencil} onClick={onEdit} />}
        </>
      }
    />
  );
}

/** Split editor: source on the left, live zoom/pan preview on the right. Save and
 * cancel sit in the preview's top-left toolbar (alongside the zoom controls). */
function EditPane({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { svg, error } = useRenderedSvg(draft, 200);
  return (
    <div className="diagram-editor">
      <textarea
        className="diagram-editor-source"
        value={draft}
        spellCheck={false}
        autoFocus
        placeholder="mermaid source…"
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="diagram-editor-preview">
        <PanZoom
          svg={svg}
          topLeft={
            <>
              <IconButton label="Cancel" icon={IconX} onClick={onCancel} />
              <IconButton label="Save" icon={IconCheck} onClick={onSave} />
            </>
          }
        />
        {error && <div className="diagram-editor-error mermaid-error">{error}</div>}
      </div>
    </div>
  );
}

/** WebKit-only pinch gesture event (not in the standard DOM lib). `scale` is the
 * cumulative magnification since the gesture began (1 at start). */
type GestureEvent = Event & { scale: number; clientX: number; clientY: number };

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const clampScale = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));

type Transform = { s: number; x: number; y: number };

function PanZoom({ svg, topLeft }: { svg: string; topLeft?: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<Transform>({ s: 1, x: 0, y: 0 });
  // Active drag origin (last pointer position); null when not panning.
  const dragFrom = useRef<{ x: number; y: number } | null>(null);

  // Size the content box to the SVG's natural (viewBox) dimensions and scale it
  // to fit the viewport, centered. Also the "reset" action.
  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const el = content?.querySelector("svg");
    if (!viewport || !content || !el) return;
    const vb = el.viewBox.baseVal;
    const natW = vb && vb.width ? vb.width : el.getBoundingClientRect().width;
    const natH = vb && vb.height ? vb.height : el.getBoundingClientRect().height;
    content.style.width = `${natW}px`;
    content.style.height = `${natH}px`;
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.maxWidth = "none";
    // offsetWidth/Height (not getBoundingClientRect) so the modal's open-scale
    // transition doesn't skew the measured viewport size.
    const vw = viewport.offsetWidth;
    const vh = viewport.offsetHeight;
    const s = Math.min(vw / natW, vh / natH) * 0.9;
    setT({ s, x: (vw - natW * s) / 2, y: (vh - natH * s) / 2 });
  }, []);

  useLayoutEffect(() => fit(), [svg, fit]);

  // Zoom toward a point (viewport-local coords), keeping that point fixed.
  const zoomToward = useCallback((cx: number, cy: number, factor: number) => {
    setT((p) => {
      const s = clampScale(p.s * factor);
      const k = s / p.s;
      return { s, x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k };
    });
  }, []);

  // Native non-passive wheel listener so preventDefault actually stops the modal
  // from scrolling (React's onWheel is passive). macOS gesture mapping:
  //   • pinch       → zoom toward cursor  (Chromium sends these as ctrl+wheel)
  //   • mouse wheel → zoom toward cursor  (wheelDelta is a multiple of 120)
  //   • 2-finger    → pan                 (trackpad scroll: smooth, often deltaX)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const wheelDelta = (e as unknown as { wheelDeltaY?: number }).wheelDeltaY ?? 0;
      const isMouseWheel =
        !e.ctrlKey && (e.deltaMode !== 0 || (e.deltaX === 0 && wheelDelta !== 0 && wheelDelta % 120 === 0));
      if (e.ctrlKey) {
        const r = viewport.getBoundingClientRect();
        zoomToward(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel) {
        const r = viewport.getBoundingClientRect();
        zoomToward(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      } else {
        setT((p) => ({ ...p, x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoomToward]);

  // Trackpad pinch. WebKit (the Tauri/macOS webview) reports pinch via its own
  // `gesture*` events with a cumulative `scale` — NOT as ctrl+wheel like Chromium.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let lastScale = 1;
    const onStart = (e: Event) => {
      e.preventDefault();
      lastScale = (e as GestureEvent).scale || 1;
    };
    const onChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      const r = viewport.getBoundingClientRect();
      zoomToward(g.clientX - r.left, g.clientY - r.top, g.scale / lastScale);
      lastScale = g.scale;
    };
    const onEnd = (e: Event) => e.preventDefault();
    viewport.addEventListener("gesturestart", onStart, { passive: false });
    viewport.addEventListener("gesturechange", onChange, { passive: false });
    viewport.addEventListener("gestureend", onEnd, { passive: false });
    return () => {
      viewport.removeEventListener("gesturestart", onStart);
      viewport.removeEventListener("gesturechange", onChange);
      viewport.removeEventListener("gestureend", onEnd);
    };
  }, [zoomToward]);

  const zoomButton = (factor: number) => {
    const r = viewportRef.current?.getBoundingClientRect();
    if (r) zoomToward(r.width / 2, r.height / 2, factor);
  };

  return (
    <div
      ref={viewportRef}
      className="diagram-viewport"
      onPointerDown={(e) => {
        dragFrom.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragFrom.current) return;
        const dx = e.clientX - dragFrom.current.x;
        const dy = e.clientY - dragFrom.current.y;
        dragFrom.current = { x: e.clientX, y: e.clientY };
        setT((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
      }}
      onPointerUp={() => (dragFrom.current = null)}
      onPointerCancel={() => (dragFrom.current = null)}
    >
      <div
        ref={contentRef}
        className="diagram-content"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transformOrigin: "0 0" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {topLeft && (
        <div
          className="diagram-controls diagram-controls--left"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {topLeft}
        </div>
      )}
      <div className="diagram-controls" onPointerDown={(e) => e.stopPropagation()}>
        <IconButton label="Zoom in" icon={IconZoomIn} onClick={() => zoomButton(1.25)} />
        <IconButton label="Zoom out" icon={IconZoomOut} onClick={() => zoomButton(1 / 1.25)} />
        <IconButton label="Reset view" icon={IconZoomReset} onClick={fit} />
      </div>
    </div>
  );
}

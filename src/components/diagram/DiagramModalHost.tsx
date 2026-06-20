/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Modal } from "@mantine/core";
import { IconCheck, IconPencil, IconX } from "@tabler/icons-react";
import { useState } from "react";

import { useRenderedSvg } from "../../lib/use-mermaid";
import { IconButton } from "../ui/IconButton";
import { PanZoom } from "./PanZoom";
import { type OpenDiagram, useDiagramStore } from "./store";

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

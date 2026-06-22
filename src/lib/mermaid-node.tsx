/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { IconPencil, IconTrash } from "@tabler/icons-react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import { useDiagramEditor } from "../components/diagram";
import { IconButton } from "../components/ui";
import { useRenderedSvg } from "./use-mermaid";

/** Starter source inserted when adding a fresh diagram. */
const TEMPLATE = "graph TD\n  A[Start] --> B[End]";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaid: {
      /** Insert an editable mermaid diagram block at the cursor. */
      insertMermaid: () => ReturnType;
    };
  }
}

/**
 * A block node holding mermaid diagram source. Stored as a
 * `<pre data-mermaid>…source…</pre>` so it survives the comment HTML round-trip
 * and is legible in raw form. In the editor it gets a live-rendering node view
 * (source textarea + rendered preview); in read-only comments the stored `<pre>`
 * is rendered to SVG by the host (see `renderMermaidBlocks`).
 */
export const Mermaid = Node.create({
  name: "mermaid",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  // StarterKit's codeBlock (priority 100) also claims bare <pre>; outrank it so
  // a stored `<pre data-mermaid>` parses back as a diagram, not a code block.
  priority: 1000,

  addAttributes() {
    return { code: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: "pre[data-mermaid]",
        getAttrs: (el) => ({ code: (el as HTMLElement).textContent ?? "" }),
      },
    ];
  },

  renderHTML({ node }) {
    // Source as a text child (not an attribute) keeps the stored HTML readable
    // and lets `parseHTML` recover it via textContent.
    return ["pre", mergeAttributes({ "data-mermaid": "" }), node.attrs.code as string];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },

  addCommands() {
    return {
      insertMermaid:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { code: TEMPLATE } }),
    };
  },
});

/** Editor node view: a compact, read-only render of the diagram with a hover
 * toolbar. Editing happens in the shared full-screen modal (the inline comment
 * is too cramped for a usable source/preview split). */
function MermaidNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const code = node.attrs.code as string;
  const { svg, error } = useRenderedSvg(code);
  const openEditor = useDiagramEditor();

  const edit = () =>
    openEditor({
      code,
      editable: true,
      initialMode: "edit",
      onSave: (next) => updateAttributes({ code: next }),
    });

  return (
    <NodeViewWrapper className="mermaid-node" contentEditable={false} data-selected={selected || undefined}>
      <div className="mermaid-node-render" onDoubleClick={edit}>
        {error ? (
          <span className="mermaid-error">{error}</span>
        ) : svg ? (
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <span className="mermaid-empty">Empty diagram</span>
        )}
      </div>
      <div className="mermaid-node-toolbar">
        <IconButton label="Edit diagram" icon={IconPencil} onClick={edit} />
        <IconButton label="Delete diagram" icon={IconTrash} danger onClick={() => deleteNode()} />
      </div>
    </NodeViewWrapper>
  );
}

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { mergeAttributes, Node } from "@tiptap/core";

/**
 * A block node for an embedded image or video attachment. Renders an
 * `<img data-attachment>` or `<video data-attachment controls>`; the
 * `data-attachment` marker lets the media src↔reference rewriting (see
 * `lib/media`) find these elements without touching unrelated `<img>`s.
 */
export const Attachment = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      kind: { default: "image" as "image" | "video" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[data-attachment]",
        getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute("src"), kind: "image" }),
      },
      {
        tag: "video[data-attachment]",
        getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute("src"), kind: "video" }),
      },
    ];
  },

  renderHTML({ node }) {
    const { src, kind } = node.attrs as { src: string; kind: "image" | "video" };
    if (kind === "video") {
      return ["video", mergeAttributes({ "data-attachment": "", controls: "true", src })];
    }
    return ["img", mergeAttributes({ "data-attachment": "", src })];
  },
});

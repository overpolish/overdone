/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box } from "@mantine/core";

import { openExternal } from "../../lib/links";
import { ScrollArea } from "../ui/ScrollArea";

/**
 * Render a release's changelog. GitHub hands us its own rendered, sanitized
 * HTML (`body_html`), so we drop it in directly - styled by `.release-notes` in
 * theme.css - the same way comment bodies are rendered. Links open in the
 * browser rather than navigating the app webview.
 */
export function ReleaseNotes({ html, maxHeight = 360 }: { html: string; maxHeight?: number }) {
  return (
    <ScrollArea maxHeight={maxHeight}>
      <Box
        className="release-notes"
        fz="sm"
        style={{ wordBreak: "break-word" }}
        onClick={(e) => {
          const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
          if (anchor) {
            e.preventDefault();
            void openExternal(anchor.href);
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </ScrollArea>
  );
}

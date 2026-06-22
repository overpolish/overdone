/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type CommentSegment } from "../../lib/code-blocks";
import { CodeBlockBar } from "../editor/CodeBlockBar";
import { ScrollArea } from "../ui/ScrollArea";

/** A read-only comment's code block: the same interactive bar, scroller and
 * highlighted code as the editor's node view, persisting language/wrap changes
 * back to the stored comment. */
export function ReadOnlyCodeBlock({
  block,
  onChange,
}: {
  block: Extract<CommentSegment, { kind: "code" }>;
  onChange: (patch: { language?: string | null; wrap?: boolean }) => void;
}) {
  return (
    <pre data-wrap={block.wrap ? "true" : undefined}>
      <CodeBlockBar
        language={block.language}
        wrap={block.wrap}
        getCode={() => block.code}
        onLanguageChange={(lang) => onChange({ language: lang || null })}
        onWrapChange={(wrap) => onChange({ wrap })}
      />
      <ScrollArea orientation="horizontal" radius={0}>
        <code
          className={block.language ? `hljs language-${block.language}` : "hljs"}
          style={{ whiteSpace: block.wrap ? "pre-wrap" : "pre" }}
          dangerouslySetInnerHTML={{ __html: block.highlighted }}
        />
      </ScrollArea>
    </pre>
  );
}

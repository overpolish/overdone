/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { IconCheck, IconCopy, IconTextWrap } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { CodeLanguageField } from "./CodeLanguageField";
import { IconButton } from "../ui/IconButton";

/**
 * A code block's top bar: the language field on the left, copy + soft-wrap
 * toggles on the right. Shared by the editor's node view (where the callbacks
 * update the node's attributes) and the read-only comment render (where they
 * save the change back to the stored comment HTML), so both look and behave the
 * same. `getCode` returns the raw text to copy.
 */
export function CodeBlockBar({
  language,
  wrap,
  getCode,
  onLanguageChange,
  onWrapChange,
}: {
  /** The selected language, or "" for auto-detect. */
  language: string;
  wrap: boolean;
  getCode: () => string;
  /** Commit a language ("" means auto-detect). */
  onLanguageChange: (lang: string) => void;
  onWrapChange: (wrap: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Copy the block's raw code (newlines included), with a brief check-mark cue.
  const copy = () => {
    void navigator.clipboard.writeText(getCode());
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1200);
  };
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  return (
    <div className="code-block-bar" contentEditable={false}>
      <CodeLanguageField value={language} onChange={onLanguageChange} />
      <span className="code-block-actions">
        <IconButton
          label={copied ? "Copied" : "Copy code"}
          icon={copied ? IconCheck : IconCopy}
          active={copied}
          compact
          onClick={copy}
        />
        <IconButton
          label={wrap ? "Disable soft wrap" : "Soft wrap"}
          icon={IconTextWrap}
          active={wrap}
          compact
          onClick={() => onWrapChange(!wrap)}
        />
      </span>
    </div>
  );
}

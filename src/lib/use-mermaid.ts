/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { useEffect, useRef, useState } from "react";

import { renderMermaid } from "./mermaid";

// Unique-per-hook id for mermaid's internal element ids (can't be reused).
let seq = 0;

/**
 * Render mermaid `code` to an SVG string, re-rendering when it changes. On a
 * syntax error the last good SVG is kept and `error` is set, so a live editor
 * preview doesn't blank out mid-edit. `debounceMs` coalesces rapid changes
 * (e.g. typing in the source box).
 */
export function useRenderedSvg(code: string, debounceMs = 0): { svg: string; error: string | null } {
  const [state, setState] = useState<{ svg: string; error: string | null }>({
    svg: "",
    error: null,
  });
  const idRef = useRef(`mmd-${(seq += 1)}`);

  useEffect(() => {
    let cancelled = false;
    const render = () =>
      void renderMermaid(idRef.current, code).then((res) => {
        if (cancelled) return;
        setState((prev) =>
          res.ok ? { svg: res.svg, error: null } : { svg: prev.svg, error: res.error },
        );
      });
    if (debounceMs) {
      const handle = setTimeout(render, debounceMs);
      return () => {
        cancelled = true;
        clearTimeout(handle);
      };
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [code, debounceMs]);

  return state;
}

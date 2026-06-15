/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { useCallback, useState } from "react";

import { useSettings } from "../../lib/settings";

/**
 * Tracks in-flight attachment imports so the editor can show a busy overlay.
 * `run` wraps an import op, counting it as in-flight until it settles.
 */
export function useMediaBusy() {
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const compressing = useSettings((s) => s.mediaCompression === "compressed");
  const run = useCallback((fn: () => Promise<void>) => {
    setError(null);
    setCount((c) => c + 1);
    void Promise.resolve()
      .then(fn)
      .catch((e) => setError(typeof e === "string" ? e : (e?.message ?? "Failed to add attachment")))
      .finally(() => setCount((c) => c - 1));
  }, []);
  return { busy: count > 0, busyLabel: compressing ? "Compressing…" : "Adding…", error, run };
}

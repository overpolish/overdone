/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { create } from "zustand";

/** Where releases are tagged. We read the version from here but never link the
 * user to it - downloads are sold through the store (see {@link STORE_URL}). */
const RELEASES_API =
  "https://api.github.com/repos/overpolish/overdone/releases/latest";

/** The product page users are sent to for an update (Payhip), not GitHub. */
export const STORE_URL = "https://store.overpolish.co/b/9MNp8";

/** Strip a leading `v` and split into numeric components, dropping any
 * pre-release suffix (e.g. `v1.2.0-beta.1` -> [1, 2, 0]). Non-numeric parts are
 * ignored so a malformed tag compares as the lowest possible version. */
function parseVersion(raw: string): number[] {
  return raw
    .replace(/^v/i, "")
    .split("-")[0] // drop any pre-release suffix (e.g. -beta.1)
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isFinite(n));
}

/** True when `latest` is a strictly higher version than `current`. Missing
 * trailing components count as 0, so 1.2 and 1.2.0 are equal. */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The released version (tag, minus any `v` prefix) and its changelog. */
interface Release {
  version: string;
  /** The release notes as GitHub-rendered, sanitized HTML (`body_html`), if
   * any - so we render it directly rather than parsing markdown ourselves. */
  notes: string | null;
}

/** Fetch the latest release from GitHub: its version and changelog. The
 * `html+json` media type asks GitHub to render the markdown body to sanitized
 * HTML for us (`body_html`). Returns null on any failure - a missed check
 * should be silent, not noisy. */
async function fetchLatestRelease(): Promise<Release | null> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github.html+json" },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== "object") return null;
    const tag = (data as { tag_name?: unknown }).tag_name;
    if (typeof tag !== "string") return null;
    // Prefer the rendered HTML; fall back to the raw markdown body if absent.
    const html = (data as { body_html?: unknown }).body_html;
    const body = (data as { body?: unknown }).body;
    const notes = typeof html === "string" ? html : typeof body === "string" ? body : "";
    return {
      version: tag.replace(/^v/i, ""),
      notes: notes.trim() ? notes : null,
    };
  } catch {
    return null;
  }
}

interface UpdateState {
  /** This build's version (from the Tauri config). Null until first checked. */
  currentVersion: string | null;
  /** The newest released version, or null if not yet/never resolved. */
  latestVersion: string | null;
  /** The latest release's changelog as rendered HTML, or null if it had none. */
  latestNotes: string | null;
  /** A check is in flight (guards against overlapping checks). */
  checking: boolean;
  /** Epoch ms of the last check attempt (0 = never), for throttling. */
  lastCheckedAt: number;
  /** Resolve the current build version and the latest release, in parallel. */
  check: () => Promise<void>;
}

export const useUpdate = create<UpdateState>((set, get) => ({
  currentVersion: null,
  latestVersion: null,
  latestNotes: null,
  checking: false,
  lastCheckedAt: 0,
  check: async () => {
    if (get().checking) return;
    // Stamp the attempt up front so the throttle counts even a failed check,
    // and a concurrent caller is gated by `checking` regardless.
    set({ checking: true, lastCheckedAt: Date.now() });
    try {
      const [current, release] = await Promise.all([
        get().currentVersion ?? getVersion().catch(() => null),
        fetchLatestRelease(),
      ]);
      set({
        currentVersion: current,
        // Keep the last known release if this check failed to resolve one.
        latestVersion: release?.version ?? get().latestVersion,
        latestNotes: release ? release.notes : get().latestNotes,
      });
    } finally {
      set({ checking: false });
    }
  },
}));

/** True when a newer release exists than this build. */
export function selectUpdateAvailable(state: UpdateState): boolean {
  const { currentVersion, latestVersion } = state;
  return !!currentVersion && !!latestVersion && isNewer(latestVersion, currentVersion);
}

const HOUR_MS = 60 * 60 * 1000;

/** Run a check only if it's been at least an hour since the last attempt, so
 * refocus + interval triggers don't hammer the API. */
function checkIfStale(): void {
  if (Date.now() - useUpdate.getState().lastCheckedAt >= HOUR_MS) {
    void useUpdate.getState().check();
  }
}

/**
 * Keep the available-update state fresh for a long-running companion window
 * without ever needing a reload: check on launch, whenever the window regains
 * focus (returning from another app or the tray), and hourly while it stays
 * focused - the latter two throttled to at most once an hour. The `checking`
 * guard collapses the duplicate StrictMode mount in dev into a single request.
 */
export function useUpdateCheck(): void {
  useEffect(() => {
    void useUpdate.getState().check();
    const id = setInterval(checkIfStale, HOUR_MS);
    const focus = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) checkIfStale();
    });
    return () => {
      clearInterval(id);
      void focus.then((off) => off());
    };
  }, []);
}

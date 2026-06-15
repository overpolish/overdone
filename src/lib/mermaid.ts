/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import type { MermaidConfig } from "mermaid";

/**
 * Mermaid diagram rendering for comments. Mermaid is heavy (bundles d3), so it's
 * lazy-imported the first time a diagram is rendered - comments without diagrams
 * never pull it in. A single module-level instance is shared and re-initialized
 * when the color scheme flips (so diagrams match light/dark).
 */

type Mermaid = typeof import("mermaid").default;

let mermaidPromise: Promise<Mermaid> | null = null;
let initializedTheme: "dark" | "default" | null = null;

/** Mantine writes the active scheme to `:root[data-mantine-color-scheme]`. */
function currentTheme(): "dark" | "default" {
  return document.documentElement.getAttribute("data-mantine-color-scheme") === "dark"
    ? "dark"
    : "default";
}

function baseConfig(theme: "dark" | "default"): MermaidConfig {
  return {
    startOnLoad: false,
    // `strict` sanitizes diagram labels (no raw HTML/scripts in the SVG).
    securityLevel: "strict",
    theme,
    fontFamily: "inherit",
  };
}

/** Load mermaid once, (re)initializing it for the current color scheme. */
async function getMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  const mermaid = await mermaidPromise;
  const theme = currentTheme();
  if (initializedTheme !== theme) {
    mermaid.initialize(baseConfig(theme));
    initializedTheme = theme;
  }
  return mermaid;
}

/**
 * Replace every stored `<pre data-mermaid>` in a comment-HTML string with its
 * rendered SVG (or an inline error), returning the new HTML. Pure string→string
 * so the caller can feed the result straight to React (`dangerouslySetInnerHTML`)
 * and let React own the DOM - no imperative post-mount mutation to be clobbered
 * on the next render. Returns the input unchanged if it has no diagrams.
 */
let displaySeq = 0;
export async function renderMermaidInHtml(html: string): Promise<string> {
  if (!html.includes("data-mermaid")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = doc.querySelectorAll<HTMLElement>("pre[data-mermaid]");
  let index = 0;
  for (const pre of blocks) {
    const source = pre.textContent ?? "";
    const res = await renderMermaid(`mmd-view-${(displaySeq += 1)}`, source);
    const out = doc.createElement("div");
    // Carry the source + position so a click can open the editor for this exact
    // diagram and the edit can be written back to the right `<pre>` (by index).
    out.setAttribute("data-mermaid-src", source);
    out.setAttribute("data-mermaid-index", String(index));
    if (res.ok) {
      out.className = "mermaid-rendered";
      out.innerHTML = res.svg;
    } else {
      // Broken diagram stays clickable (mermaid-rendered) so it can be fixed.
      out.className = "mermaid-rendered mermaid-broken";
      out.textContent = res.error;
    }
    pre.replaceWith(out);
    index += 1;
  }
  return doc.body.innerHTML;
}

export type MermaidResult = { ok: true; svg: string } | { ok: false; error: string };

/**
 * Render mermaid source to an SVG string. `id` must be unique per call site
 * (mermaid uses it for internal element ids). Never throws - a syntax error
 * comes back as `{ ok: false, error }` so callers can show the message inline.
 */
export async function renderMermaid(id: string, code: string): Promise<MermaidResult> {
  const source = code.trim();
  if (!source) return { ok: false, error: "Empty diagram" };
  try {
    const mermaid = await getMermaid();
    // `parse` throws on invalid syntax *without* injecting an error node into
    // the document (which `render` does on failure), keeping cleanup simple.
    await mermaid.parse(source);
    const { svg } = await mermaid.render(id, source);
    return { ok: true, svg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

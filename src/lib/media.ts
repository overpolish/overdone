import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { type Editor } from "@tiptap/react";

import { useSettings } from "./settings";

/**
 * Comment attachments (images / videos). Files live on disk under
 * `<app data>/media/<listId>/<uuid>.<ext>`; comment HTML stores a portable
 * `media/<uuid>.<ext>` reference (so it survives export to a folder). The webview
 * can't load that relative path, so for display we rewrite it to a Tauri asset
 * URL, and rewrite it back before persisting.
 */

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v", "ogv"];
export const MEDIA_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS];

export type MediaKind = "image" | "video";

export function kindForExt(ext: string): MediaKind | null {
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.includes(e)) return "image";
  if (VIDEO_EXTS.includes(e)) return "video";
  return null;
}

/** Extension (no dot) of a path or filename, lowercased. */
function extOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Asset URL the webview can load for a stored attachment filename. */
export function attachmentUrl(mediaDir: string, filename: string): string {
  return convertFileSrc(`${mediaDir}/${filename}`);
}

/** Insert an image/video node into the editor for a stored attachment. */
export function insertAttachment(
  editor: Editor,
  mediaDir: string,
  filename: string,
  kind: MediaKind,
) {
  editor
    .chain()
    .focus()
    .insertContent({ type: "attachment", attrs: { src: attachmentUrl(mediaDir, filename), kind } })
    .run();
}

/** Whether attachments should be re-encoded to save space (vs kept as-is). */
function compressing(): boolean {
  return useSettings.getState().mediaCompression === "compressed";
}

/** Promisified canvas.toBlob. */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Re-encode an image in the webview (no ffmpeg/libwebp needed). Prefers WebP,
 * falling back to JPEG where the webview can't encode WebP. Returns null if the
 * image can't be decoded, so the caller can fall back to storing the original.
 */
async function compressImage(blob: Blob): Promise<{ data: Uint8Array; ext: string } | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    let out = await canvasToBlob(canvas, "image/webp", 0.82);
    let ext = "webp";
    if (!out || out.type !== "image/webp") {
      out = await canvasToBlob(canvas, "image/jpeg", 0.82);
      ext = "jpg";
    }
    if (!out) return null;
    return { data: new Uint8Array(await out.arrayBuffer()), ext };
  } catch {
    return null;
  }
}

/** Store raw bytes as an attachment under a fresh id; returns its filename. */
async function storeBytes(listId: string, data: Uint8Array, ext: string): Promise<string> {
  const filename = `${crypto.randomUUID()}.${ext}`;
  await invoke("write_attachment", { listId, fileName: filename, data: Array.from(data) });
  return filename;
}

/** Import a file (by path): copy as-is, or compress (canvas for images, ffmpeg
 * for video) when compression is enabled. */
async function importPath(
  listId: string,
  path: string,
): Promise<{ filename: string; kind: MediaKind } | null> {
  const ext = extOf(path);
  const kind = kindForExt(ext);
  if (!kind) return null;

  if (compressing()) {
    if (kind === "image") {
      const bytes = await invoke<number[]>("read_file", { path });
      const compressed = await compressImage(new Blob([new Uint8Array(bytes)]));
      if (compressed) {
        return { filename: await storeBytes(listId, compressed.data, compressed.ext), kind };
      }
      // Fall through to copying the original on decode failure.
    } else {
      const filename = `${crypto.randomUUID()}.mp4`;
      await invoke("compress_path", { listId, fileName: filename, src: path, kind });
      return { filename, kind };
    }
  }

  const filename = `${crypto.randomUUID()}.${ext}`;
  await invoke("import_attachment", { listId, src: path, fileName: filename });
  return { filename, kind };
}

/** Import in-memory bytes (e.g. a pasted image): store as-is or compress. */
async function importBytes(
  listId: string,
  data: Uint8Array,
  ext: string,
): Promise<{ filename: string; kind: MediaKind } | null> {
  const kind = kindForExt(ext);
  if (!kind) return null;

  if (compressing()) {
    if (kind === "image") {
      const compressed = await compressImage(new Blob([data]));
      if (compressed) {
        return { filename: await storeBytes(listId, compressed.data, compressed.ext), kind };
      }
      // Fall through to storing the original on decode failure.
    } else {
      const filename = `${crypto.randomUUID()}.mp4`;
      await invoke("compress_bytes", {
        listId,
        fileName: filename,
        srcExt: ext,
        data: Array.from(data),
        kind,
      });
      return { filename, kind };
    }
  }

  return { filename: await storeBytes(listId, data, ext), kind };
}

/** Open the OS file picker and insert the chosen image/video files. */
export async function pickAndInsert(editor: Editor, listId: string, mediaDir: string) {
  const selected = await openDialog({
    multiple: true,
    filters: [{ name: "Media", extensions: MEDIA_EXTS }],
  });
  if (!selected) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  for (const path of paths) {
    const res = await importPath(listId, path);
    if (res) insertAttachment(editor, mediaDir, res.filename, res.kind);
  }
}

/** Import + insert files dropped from the OS (Tauri provides their paths). */
export async function insertDroppedPaths(
  editor: Editor,
  listId: string,
  mediaDir: string,
  paths: string[],
) {
  for (const path of paths) {
    const res = await importPath(listId, path);
    if (res) insertAttachment(editor, mediaDir, res.filename, res.kind);
  }
}

/** Import + insert pasted file blobs (clipboard images/videos). */
export async function insertPastedFiles(
  editor: Editor,
  listId: string,
  mediaDir: string,
  files: File[],
) {
  for (const file of files) {
    const ext = file.name.includes(".") ? extOf(file.name) : (file.type.split("/")[1] ?? "");
    const data = new Uint8Array(await file.arrayBuffer());
    const res = await importBytes(listId, data, ext);
    if (res) insertAttachment(editor, mediaDir, res.filename, res.kind);
  }
}

/** Open an attachment full-size in the OS default viewer, given its display URL
 * (asset URL) and the list's media folder. */
export async function openFullSize(displaySrc: string, mediaDir: string) {
  const file = decodeURIComponent(displaySrc.split(/[?#]/)[0]).split("/").pop();
  if (file) await openPath(`${mediaDir}/${file}`);
}

/** Stored HTML (canonical `media/<f>` srcs) → display HTML (asset URLs). */
export function toDisplayHtml(html: string, mediaDir: string): string {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll<HTMLElement>("[data-attachment]").forEach((el) => {
    const src = el.getAttribute("src") ?? "";
    if (src.startsWith("media/")) {
      el.setAttribute("src", attachmentUrl(mediaDir, src.slice("media/".length)));
    }
  });
  return doc.body.innerHTML;
}

/** Display HTML (asset URLs) → stored HTML (canonical `media/<f>` srcs). */
export function toStoredHtml(html: string): string {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll<HTMLElement>("[data-attachment]").forEach((el) => {
    const src = el.getAttribute("src") ?? "";
    // `convertFileSrc` percent-encodes the whole absolute path into one URL
    // segment, so decode first, *then* take the basename (the `<uuid>.<ext>`).
    const path = decodeURIComponent(src.split(/[?#]/)[0]);
    const base = path.split("/").pop() ?? "";
    if (base) el.setAttribute("src", `media/${base}`);
  });
  return doc.body.innerHTML;
}

/** Attachment filenames referenced by the given comment HTML (for pruning). */
export function referencedMedia(texts: string[]): string[] {
  const found = new Set<string>();
  const re = /src="media\/([^"]+)"/g;
  for (const text of texts) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) found.add(decodeURIComponent(m[1]));
  }
  return [...found];
}

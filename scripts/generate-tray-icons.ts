/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ora from "ora";
import sharp from "sharp";

/** Source line-art logo. It uses `currentColor`, so we recolor it per output. */
const SOURCE_SVG = "assets/overdone.svg";
const OUTPUT_DIR = "src-tauri/icons";
const SIZE = 32;
/** Render the 24px-viewBox SVG at high density for a crisp downscale to SIZE. */
const DENSITY = 300;
const BADGE_COLOR = "#ef4444"; // Tailwind red-500

interface TrayIcon {
  file: string;
  color: string;
  badge?: boolean;
  description: string;
}

const ICONS: TrayIcon[] = [
  {
    file: "tray-template.png",
    color: "#000000",
    description: "macOS menu-bar template (black)",
  },
  {
    file: "tray-windows.png",
    color: "#ffffff",
    description: "Windows tray (white)",
  },
  {
    file: "tray-alert.png",
    color: "#ffffff",
    badge: true,
    description: "attention badge (white + red dot)",
  },
];

const SPINNER = ora();

/** Recolor the source SVG by replacing its `currentColor` stroke. */
const recolor = (svg: string, color: string): Buffer =>
  Buffer.from(svg.replace(/currentColor/g, color));

/** A red circle badge in the top-right corner, composited over the logo. */
const badgeSvg = (): Buffer =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
      `<circle cx="23" cy="9" r="7" fill="${BADGE_COLOR}"/>` +
      `</svg>`,
  );

const renderIcon = async (svg: string, icon: TrayIcon): Promise<void> => {
  const base = await sharp(recolor(svg, icon.color), { density: DENSITY })
    .resize(SIZE, SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const pipeline = icon.badge
    ? sharp(base).composite([{ input: badgeSvg() }])
    : sharp(base);

  await pipeline.png().toFile(path.join(OUTPUT_DIR, icon.file));
};

const main = async (): Promise<void> => {
  try {
    SPINNER.start("Reading source SVG");
    const svg = fs.readFileSync(SOURCE_SVG, "utf8");
    SPINNER.succeed(`Source: ${SOURCE_SVG}`);

    for (const icon of ICONS) {
      SPINNER.start(`Generating ${icon.file} (${icon.description})`);
      await renderIcon(svg, icon);
      SPINNER.succeed(`${icon.file} (${icon.description})`);
    }

    SPINNER.succeed("✨ Tray icons generated");
  } catch (error) {
    SPINNER.fail("Tray icon generation failed");
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
};

void main();

import fs from "node:fs";
import path from "node:path";

import CONFIG from "../config";
import {
  backup,
  ensureDirectoryExists,
  resolveTemporaryPath,
  restore,
} from "../file";
import { createAndroidDrawable } from "../generators/gradient";

/**
 * Update adaptive icon XML files to use specified background reference.
 */
const updateAdaptiveIconBackground = (
  oldReference: string,
  newReference: string,
): void => {
  const directory = CONFIG.constants.androidAdaptiveDirs.find((d) =>
    d.startsWith("mipmap-anydpi"),
  );
  if (!directory) return;

  const iconFiles = [
    path.join(CONFIG.dirs.androidRes, directory, "ic_launcher.xml"),
    path.join(CONFIG.dirs.androidRes, directory, "ic_launcher_round.xml"),
  ];

  for (const iconPath of iconFiles) {
    if (!fs.existsSync(iconPath)) continue;
    let content: string = fs.readFileSync(iconPath, "utf8");
    content = content.replaceAll(oldReference, newReference);
    fs.writeFileSync(iconPath, content);
  }
};

/** Backup Android adaptive icon directories. */
export const backupAndroidAdaptive = (): void => {
  const backupPath = resolveTemporaryPath("android-adaptive");
  ensureDirectoryExists(backupPath);

  for (const directory of CONFIG.constants.androidAdaptiveDirs) {
    const sourceDirectory = path.join(CONFIG.dirs.androidRes, directory);
    const targetDirectory = path.join(backupPath, directory);
    if (fs.existsSync(sourceDirectory)) {
      backup(sourceDirectory, targetDirectory);
    }
  }
};

/** Restore Android adaptive icon directories from backup. */
export const restoreAndroidAdaptive = (): void => {
  const backupPath = resolveTemporaryPath("android-adaptive");
  if (!fs.existsSync(backupPath)) return;

  const adaptiveDirectories = fs.readdirSync(backupPath);
  for (const directory of adaptiveDirectories) {
    const sourcePath = path.join(backupPath, directory);
    const targetPath = path.join(CONFIG.dirs.androidRes, directory);
    if (fs.existsSync(sourcePath)) {
      restore(sourcePath, targetPath);
    }
  }
};

/** Create gradient drawable and update adaptive icon to use it. */
export const setupGradientBackground = (baseColor: string): void => {
  const drawableDirectory = path.join(CONFIG.dirs.androidRes, "drawable");
  ensureDirectoryExists(drawableDirectory);

  const drawablePath = path.join(
    drawableDirectory,
    "ic_launcher_background.xml",
  );
  const drawableContent = createAndroidDrawable(baseColor);
  fs.writeFileSync(drawablePath, drawableContent);

  updateAdaptiveIconBackground(
    "@color/ic_launcher_background",
    "@drawable/ic_launcher_background",
  );
};

/** Update the background color in the Android launcher XML files. */
export const updateBackgroundColor = (hexColor: string): void => {
  const xmlPath = path.join(
    CONFIG.dirs.androidRes,
    CONFIG.files.androidBackgroundXml,
  );

  if (!fs.existsSync(xmlPath)) return;

  const xmlContent = fs.readFileSync(xmlPath, "utf8");
  const updatedXml = xmlContent.replace(
    /(<color name="ic_launcher_background">).*?(<\/color>)/,
    `$1${hexColor}$2`,
  );

  fs.writeFileSync(xmlPath, updatedXml);

  updateAdaptiveIconBackground(
    "@drawable/ic_launcher_background",
    "@color/ic_launcher_background",
  );
};

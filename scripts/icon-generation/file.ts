import fs from "node:fs";
import path from "node:path";

import CONFIG from "./config";

/** Ensure directory exists, creating it if necessary. */
export const ensureDirectoryExists = (directoryPath: string): void => {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
};

/**
 * Find the first existing input icon file in the assets directory.
 * @returns The path to the found input icon file.
 * @throws {Error} If no input icon file is found in the assets directory.
 */
export const findInputIcon = (): string => {
  const candidates = ["icon.svg", "icon.png", "icon.jpg", "icon.jpeg"];
  for (const candidate of candidates) {
    const candidatePath = path.join(CONFIG.dirs.assets, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    `No input icon found in ${CONFIG.dirs.assets}. Please add: ${candidates.join(", ")}`,
  );
};

/**
 * Get the temporary path for a given subpath.
 * @returns The path to the temporary location for the specified subpath.
 */
export const resolveTemporaryPath = (subpath: string): string => {
  return path.join(CONFIG.dirs.temp, subpath);
};

/** Backup a directory or file to the backup location. */
export const backup = (sourcePath: string, backupPath: string): void => {
  ensureDirectoryExists(path.dirname(backupPath));
  if (fs.existsSync(sourcePath)) {
    fs.cpSync(sourcePath, backupPath, { recursive: true });
  }
};

/** Move a directory or file to a new location. */
export const move = (source: string, destination: string): void => {
  ensureDirectoryExists(path.dirname(destination));
  fs.renameSync(source, destination);
};

/**
 * Restore a directory or file from the backup location.
 * @param backupPath Path to restore from.
 * @param originalPath Path to restore to.
 */
export const restore = (backupPath: string, originalPath: string): void => {
  if (!fs.existsSync(backupPath)) {
    return;
  }
  ensureDirectoryExists(path.dirname(originalPath));
  fs.cpSync(backupPath, originalPath, { recursive: true });
};

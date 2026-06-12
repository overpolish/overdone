import fs from "node:fs";

import CONFIG from "../config";
import { backup, resolveTemporaryPath, restore } from "../file";

/** Backup iOS icon assets. */
export const backupIOSIcons = (): void => {
  const backupPath = resolveTemporaryPath("ios-icons");
  if (fs.existsSync(CONFIG.dirs.iosIcons)) {
    backup(CONFIG.dirs.iosIcons, backupPath);
  }
};

/** Restore iOS icon assets from backup. */
export const restoreIOSIcons = (): void => {
  const backupPath = resolveTemporaryPath("ios-icons");
  if (fs.existsSync(backupPath)) {
    restore(backupPath, CONFIG.dirs.iosIcons);
  }
};

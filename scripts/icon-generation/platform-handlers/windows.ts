import fs from "node:fs";
import path from "node:path";

import CONFIG from "../config";
import { backup, resolveTemporaryPath, restore } from "../file";

/** Backup Windows icon assets. */
export const backupWindowsIcons = (): void => {
  const backupPath = resolveTemporaryPath("windows-icons");
  if (fs.existsSync(CONFIG.dirs.tauriIcons)) {
    backup(CONFIG.dirs.tauriIcons, backupPath);
    if (
      fs.existsSync(path.join(CONFIG.dirs.tauriIcons, CONFIG.files.macosIcns))
    ) {
      // MacOS icon is not overwritten by tauri icon command, so we don't
      // want to back it up as it would overwrite on restore
      fs.rmSync(path.join(backupPath, CONFIG.files.macosIcns));
    }
  }
};

/** Restore Windows icon assets from backup. */
export const restoreWindowsIcons = (): void => {
  const backupPath = resolveTemporaryPath("windows-icons");
  if (fs.existsSync(backupPath)) {
    restore(backupPath, CONFIG.dirs.tauriIcons);
  }
};

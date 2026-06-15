/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

#!/usr/bin/env node
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ora from "ora";

import type { IconGenerationOptions } from "./icon-generation/generators/icon";
import type { BackgroundShape, Platform } from "./icon-generation/types";

import CONFIG from "./icon-generation/config";
import {
  ensureDirectoryExists,
  findInputIcon,
  move,
  resolveTemporaryPath,
} from "./icon-generation/file";
import {
  createIconWithBackground,
  createPaddedIcon,
} from "./icon-generation/generators/icon";
import {
  backupAndroidAdaptive,
  restoreAndroidAdaptive,
  setupGradientBackground,
  updateBackgroundColor,
} from "./icon-generation/platform-handlers/android";
import {
  backupIOSIcons,
  restoreIOSIcons,
} from "./icon-generation/platform-handlers/ios";
import {
  backupWindowsIcons,
  restoreWindowsIcons,
} from "./icon-generation/platform-handlers/windows";
import {
  getBackgroundColor,
  getBackgroundShape,
  getMacOSSolidBackground,
  getPlatformsToGenerate,
  getUseGradient,
  getWindowsSolidBackground,
} from "./icon-generation/prompts";

const execAsync = promisify(exec);

interface UserOptions {
  backgroundColor: string;
  backgroundShape?: BackgroundShape;
  macosUseSolidBackground?: boolean;
  platforms: Platform[];
  useGradient?: boolean;
  windowsUseSolidBackground?: boolean;
}

const SPINNER = ora();

/** Run a shell command asynchronously, suppressing output. */
const runCommand = async (command: string): Promise<void> => {
  await execAsync(command);
};

/**
 * Generate icons for a specific platform using the input icon and user options.
 * @returns The path to the generated icon file for the platform.
 */
const generatePlatformIcons = async (
  inputIcon: string,
  platform: Platform,
  userOptions: UserOptions,
): Promise<string> => {
  const config = CONFIG.platform[platform];
  const temporaryPath = resolveTemporaryPath(`icon-${platform}-temp.png`);

  const options: IconGenerationOptions = {
    backgroundColor: userOptions.backgroundColor,
    backgroundShape:
      // iOS doesn't use a background shape
      platform === "ios" ? undefined : userOptions.backgroundShape,
    inputPath: inputIcon,
    outputPath: temporaryPath,
    paddingPercent: config.padding,
    platform,
    useGradient: userOptions.useGradient,
  };

  switch (platform) {
    case "android": {
      await createPaddedIcon(inputIcon, temporaryPath, config.padding);
      break;
    }
    case "ios": {
      await createIconWithBackground(options);
      break;
    }
    case "macos": {
      await (userOptions.macosUseSolidBackground
        ? createIconWithBackground({
            ...options,
            outerPaddingPercent: CONFIG.platform.macos.padding,
          })
        : createPaddedIcon(inputIcon, temporaryPath, config.padding));
      break;
    }
    case "windows": {
      await (userOptions.windowsUseSolidBackground
        ? createIconWithBackground({
            ...options,
            paddingPercent: config.padding * 2,
          })
        : createPaddedIcon(inputIcon, temporaryPath, config.padding));
      break;
    }
    default: {
      const _exhaustive: never = platform;
      throw new Error(`Unhandled platform: ${String(_exhaustive)}`);
    }
  }

  return temporaryPath;
};

/** Handle macOS icons generation. */
const handleMacOSIcons = async (
  inputIcon: string,
  userOptions: UserOptions,
): Promise<void> => {
  const macosTemporaryIcon = await generatePlatformIcons(
    inputIcon,
    "macos",
    userOptions,
  );
  SPINNER.start("Generating macOS icons");

  await runCommand(`pnpm tauri icon ${macosTemporaryIcon}`);
  const generatedIcns = path.join(
    CONFIG.dirs.tauriIcons,
    CONFIG.files.generatedIcns,
  );
  if (fs.existsSync(generatedIcns)) {
    move(
      generatedIcns,
      path.join(CONFIG.dirs.tauriIcons, CONFIG.files.macosIcns),
    );
  }

  SPINNER.succeed("macOS icons generated");
};

/** Handle Android icons generation. */
const handleAndroidIcons = async (
  inputIcon: string,
  userOptions: UserOptions,
): Promise<void> => {
  SPINNER.start("Generating Android icons");
  const androidTemporaryIcon = await generatePlatformIcons(
    inputIcon,
    "android",
    userOptions,
  );
  await runCommand(`pnpm tauri icon ${androidTemporaryIcon}`);
  backupAndroidAdaptive();
  SPINNER.succeed("Android icons generated");
};

/** Handle iOS icons generation. */
const handleIOSIcons = async (
  inputIcon: string,
  userOptions: UserOptions,
): Promise<void> => {
  SPINNER.start("Generating iOS icons");
  const iosTemporaryIcon = await generatePlatformIcons(
    inputIcon,
    "ios",
    userOptions,
  );
  await runCommand(`pnpm tauri icon ${iosTemporaryIcon}`);
  backupIOSIcons();
  SPINNER.succeed("iOS icons generated");
};

/** Handle Windows icons generation. */
const handleWindowsIcons = async (
  inputIcon: string,
  userOptions: UserOptions,
): Promise<void> => {
  SPINNER.start("Generating Windows icons");
  const windowsTemporaryIcon = await generatePlatformIcons(
    inputIcon,
    "windows",
    userOptions,
  );
  await runCommand(`pnpm tauri icon ${windowsTemporaryIcon}`);
  backupWindowsIcons();
  SPINNER.succeed("Windows icons generated");
};

/** Handle directories setup. */
const setupDirectories = (): void => {
  SPINNER.start("Setting up directories");
  ensureDirectoryExists(CONFIG.dirs.assets);
  ensureDirectoryExists(CONFIG.dirs.temp);
  SPINNER.succeed("Directories ready");
};

/**
 * Prompt user for options and return them in a structured format.
 * @returns An object containing user-selected options for icon generation.
 */
const getUserOptions = async (): Promise<UserOptions> => {
  const platforms = await getPlatformsToGenerate();

  let backgroundColor = "#171717";
  let useGradient = false;
  let backgroundShape: BackgroundShape | undefined = undefined;
  let windowsUseSolidBackground: boolean | undefined = undefined;
  let macosUseSolidBackground: boolean | undefined = undefined;

  if (platforms.includes("windows")) {
    windowsUseSolidBackground = await getWindowsSolidBackground();
  }

  if (platforms.includes("macos")) {
    macosUseSolidBackground = await getMacOSSolidBackground();
  }

  const needsBackground =
    platforms.includes("ios") ||
    platforms.includes("android") ||
    windowsUseSolidBackground === true ||
    macosUseSolidBackground === true;

  if (needsBackground) {
    backgroundColor = await getBackgroundColor();
    useGradient = await getUseGradient();

    if (macosUseSolidBackground === true || windowsUseSolidBackground === true) {
      backgroundShape = await getBackgroundShape();
    }
  }

  return {
    backgroundColor,
    backgroundShape,
    macosUseSolidBackground,
    platforms,
    useGradient,
    windowsUseSolidBackground,
  };
};

/** Backup existing icons for all platforms. */
const backupAllIcons = (): void => {
  // Always backup as tauri icon overwrites ALL icons, including non-selected
  // platforms.
  backupWindowsIcons();
  backupAndroidAdaptive();
  backupIOSIcons();
};

/** Move generated icons to their final locations. */
const moveIconsToFinalLocations = (userOptions: UserOptions): void => {
  SPINNER.start("Moving generated icons to final locations");
  restoreWindowsIcons();
  restoreAndroidAdaptive();
  restoreIOSIcons();

  if (userOptions.platforms.includes("android")) {
    // Has to be done last as tauri icon overwrites ic_launcher_background.xml
    // color
    if (userOptions.useGradient)
      setupGradientBackground(userOptions.backgroundColor);
    else updateBackgroundColor(userOptions.backgroundColor);
  }
  SPINNER.succeed("Icons moved to final locations");
};

/** Generate icons for all selected platforms sequentially. */
const generateAllPlatformIcons = async (
  inputIcon: string,
  userOptions: UserOptions,
): Promise<void> => {
  if (userOptions.platforms.includes("macos")) {
    await handleMacOSIcons(inputIcon, userOptions);
  }

  if (userOptions.platforms.includes("android")) {
    await handleAndroidIcons(inputIcon, userOptions);
  }

  if (userOptions.platforms.includes("ios")) {
    await handleIOSIcons(inputIcon, userOptions);
  }

  if (userOptions.platforms.includes("windows")) {
    await handleWindowsIcons(inputIcon, userOptions);
  }
};

/**
 * Set up, prompt for options, and prepare for icon generation.
 * @returns An object containing the path to the input icon and user-selected options.
 */
const initialize = async (): Promise<{
  inputIcon: string;
  userOptions: UserOptions;
}> => {
  setupDirectories();

  SPINNER.start("Looking for input icon");
  const inputIcon = findInputIcon();
  SPINNER.succeed(`Found input icon: ${path.basename(inputIcon)}`);

  const userOptions = await getUserOptions();
  backupAllIcons();

  return { inputIcon, userOptions };
};

/** Main function to generate icons for various platforms. */
const main = async (): Promise<void> => {
  try {
    const { inputIcon, userOptions } = await initialize();
    await generateAllPlatformIcons(inputIcon, userOptions);
    moveIconsToFinalLocations(userOptions);
    SPINNER.succeed("✨ All icons generated successfully!");
  } catch (error) {
    SPINNER.fail("Icon generation failed");
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );

    process.exit(1);
  } finally {
    SPINNER.start("Cleaning up temporary files...");
    if (fs.existsSync(CONFIG.dirs.temp)) {
      fs.rmSync(CONFIG.dirs.temp, { force: true, recursive: true });
    }
    SPINNER.succeed("Cleanup complete");
  }
};

void main();

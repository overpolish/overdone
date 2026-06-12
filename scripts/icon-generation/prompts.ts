import { checkbox, input, select } from "@inquirer/prompts";
import fs from "node:fs";

import type { BackgroundShape, Platform } from "./types";

import CONFIG from "./config";

/**
 * Request background color from the user.
 * @returns A hex color string for the background.
 */
export const getBackgroundColor = async (): Promise<string> => {
  const choice = await select<"custom" | "dark" | "light">({
    choices: [
      { name: "Light", value: "light" },
      { name: "Dark", value: "dark" },
      { name: "Custom hex code", value: "custom" },
    ],
    default: "dark",
    message: "Choose a background color:",
  });

  switch (choice) {
    case "dark": {
      return "#171717";
    }
    case "light": {
      return "#FFFFFF";
    }
    default: {
      return await input({
        default: "#171717",
        message: "Enter a custom hex color:",
        validate: (value) =>
          /^#[0-9A-Fa-f]{6}$/.test(value)
            ? true
            : "Please enter a valid hex color (e.g., #171717)",
      });
    }
  }
};

/**
 * Request background shape from the user.
 * @returns The selected background shape.
 */
export const getBackgroundShape = async (): Promise<BackgroundShape> => {
  return await select<BackgroundShape>({
    choices: [
      { name: "Rounded Rectangle", value: "rounded-rectangle" },
      { name: "Squircle", value: "squircle" },
    ],
    default: "rounded-rectangle",
    message: "Choose background shape:",
  });
};

/**
 * Request platforms to generate icons for.
 * @returns An array of selected platforms.
 */
export const getPlatformsToGenerate = async (): Promise<Platform[]> => {
  const platforms = await checkbox<Platform>({
    choices: Object.entries(CONFIG.platform).map(([key, value]) => {
      const hasPrerequisite =
        "prerequisite" in value ? fs.existsSync(value.prerequisite) : true;

      const label =
        hasPrerequisite || !("prerequisite" in value)
          ? value.name
          : `${value.name} (${value.prerequisite} not found)`;

      return {
        checked: hasPrerequisite,
        name: label,
        value: key as Platform,
      };
    }),
    message: "Select platforms to generate icons for:",
    validate: (selected) =>
      selected.length > 0 ? true : "Please select at least one platform",
  });

  return platforms;
};

/**
 * Request whether to use a gradient.
 * @returns `true` if a gradient should be used.
 */
export const getUseGradient = async (): Promise<boolean> => {
  const choice = await select<boolean>({
    choices: [
      { name: "Yes - Subtle gradient", value: true },
      { name: "No - Solid color", value: false },
    ],
    default: true,
    message: "Use a subtle gradient background?",
  });

  return choice;
};

/**
 * Request whether to use a solid background for macOS icons.
 * @returns `true` for the solid rounded tile, `false` to keep the icon
 *   transparent (resized/padded as-is).
 */
export const getMacOSSolidBackground = async (): Promise<boolean> => {
  const choice = await select<boolean>({
    choices: [
      { name: "Solid - Rounded tile background", value: true },
      { name: "Transparent - Use as-is (resize only)", value: false },
    ],
    default: true,
    message: "macOS icon background:",
  });

  return choice;
};

/**
 * Request whether to use a solid background for Windows icons.
 * @returns `true` if a solid background should be used for Windows icons.
 */
export const getWindowsSolidBackground = async (): Promise<boolean> => {
  const choice = await select<boolean>({
    choices: [
      { name: "Transparent", value: false },
      { name: "Solid", value: true },
    ],
    default: false,
    message: "Windows icon background:",
  });

  return choice;
};

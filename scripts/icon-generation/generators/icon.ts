import sharp from "sharp";

import type { BackgroundShape, Platform } from "../types";

import CONFIG from "../config";
import { createGradientBuffer } from "./gradient";
import { createRoundedRectangle, createSquircle } from "./mask";

/**
 * Create empty canvas of specified size.
 * @returns A Sharp instance representing the canvas.
 */
const createCanvas = (size: number, background?: string): sharp.Sharp => {
  return sharp({
    create: {
      background: background ?? { alpha: 0, b: 0, g: 0, r: 0 },
      channels: 4,
      height: size,
      width: size,
    },
  });
};

/**
 * Resize an icon to the specified size.
 * @returns A buffer containing the resized icon.
 */
const resizeIcon = async (inputPath: string, size: number): Promise<Buffer> => {
  return sharp(inputPath)
    .resize(size, size, {
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      fit: "contain",
    })
    .png()
    .toBuffer();
};

/**
 * Create a background canvas, optionally with a gradient, for the icon.
 * @returns A Sharp instance representing the background canvas.
 */
const createBackgroundCanvas = async (
  size: number,
  backgroundColor?: string,
  useGradient?: boolean,
): Promise<sharp.Sharp> => {
  if (useGradient && backgroundColor) {
    const gradientBuffer = await createGradientBuffer(size, backgroundColor);
    return sharp(gradientBuffer);
  }
  return createCanvas(size, backgroundColor);
};

interface CompositeIconOptions {
  background: sharp.Sharp;
  images: sharp.OverlayOptions[];
  outerPaddingSize: number;
  outputPath: string;
}

/** Composite the icon onto the background canvas with optional padding and shape. */
const compositeFinalIcon = async (
  options: CompositeIconOptions,
): Promise<void> => {
  const composited = await options.background
    .composite(options.images)
    .png()
    .toBuffer();
  await (options.outerPaddingSize === 0
    ? sharp(composited).toFile(options.outputPath)
    : createCanvas(CONFIG.constants.targetSize)
        .composite([
          {
            input: composited,
            left: options.outerPaddingSize,
            top: options.outerPaddingSize,
          },
        ])
        .png()
        .toFile(options.outputPath));
};

export interface IconGenerationOptions {
  backgroundColor?: string;
  backgroundShape?: BackgroundShape;
  inputPath: string;
  /**
   * When set, the background + mask is rendered at
   * (targetSize - outerPaddingPercent * 2), then composited onto a transparent
   * canvas of targetSize. This produces the macOS-style floating rounded tile
   * with a transparent border.
   */
  outerPaddingPercent?: number;
  outputPath: string;
  paddingPercent: number;
  platform: Platform;
  useGradient?: boolean;
}

/**
 * Create and save an icon with padding around it.
 * @param inputPath Path to the source icon image.
 * @param outputPath Path to save the generated icon.
 * @param paddingPercent Percentage of the total size to use as padding on each side.
 */
export const createPaddedIcon = async (
  inputPath: string,
  outputPath: string,
  paddingPercent: number,
): Promise<void> => {
  const paddingSize = Math.floor(CONFIG.constants.targetSize * paddingPercent);
  const iconSize = CONFIG.constants.targetSize - paddingSize * 2;

  const resizedIcon = await resizeIcon(inputPath, iconSize);
  const canvas = createCanvas(CONFIG.constants.targetSize);

  await canvas
    .composite([{ input: resizedIcon, left: paddingSize, top: paddingSize }])
    .png()
    .toFile(outputPath);
};

/** Create an icon with a background color and padding. */
export const createIconWithBackground = async (
  options: IconGenerationOptions,
): Promise<void> => {
  const outerPaddingSize = options.outerPaddingPercent
    ? Math.floor(CONFIG.constants.targetSize * options.outerPaddingPercent)
    : 0;
  const backgroundSize = CONFIG.constants.targetSize - outerPaddingSize * 2;
  const paddingSize = Math.floor(backgroundSize * options.paddingPercent);
  const iconSize = backgroundSize - paddingSize * 2;

  const resizedIcon = await resizeIcon(options.inputPath, iconSize);

  const background = await createBackgroundCanvas(
    backgroundSize,
    options.backgroundColor,
    options.useGradient,
  );

  const images: sharp.OverlayOptions[] = [
    { input: resizedIcon, left: paddingSize, top: paddingSize },
  ];

  if (options.backgroundShape !== undefined) {
    const cornerRadius = Math.floor(
      backgroundSize * CONFIG.constants.macosCornerRadiusPercent,
    );
    const mask =
      options.backgroundShape === "squircle"
        ? createSquircle(backgroundSize, backgroundSize)
        : createRoundedRectangle(backgroundSize, backgroundSize, cornerRadius);

    images.unshift({ blend: "dest-in", input: mask });
  }

  await compositeFinalIcon({
    background,
    images,
    outerPaddingSize,
    outputPath: options.outputPath,
  });
};

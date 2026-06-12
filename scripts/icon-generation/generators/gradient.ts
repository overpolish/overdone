/* eslint-disable no-magic-numbers */
import { colord } from "colord";
import sharp from "sharp";

/**
 * Get gradient color variants based on the base color's brightness.
 * @returns Two color variants for gradient generation.
 */
const getGradientVariants = (
  baseColor: string,
): {
  variantA: string;
  variantB: string;
} => {
  const base = colord(baseColor);
  const brightness = base.brightness();
  let variantA: string;
  let variantB: string;
  if (brightness < 0.3) {
    variantA = base.lighten(0.2).rotate(20).toHex();
    variantB = base.lighten(0.08).rotate(-20).toHex();
  } else if (brightness >= 1) {
    variantA = base.darken(0.15).rotate(20).toHex();
    variantB = base.darken(0.3).rotate(-20).toHex();
  } else {
    variantA = base.lighten(0.08).rotate(20).toHex();
    variantB = base.darken(0.08).rotate(-20).toHex();
  }

  return { variantA, variantB };
};

/**
 * Generate a subtle radial gradient SVG.
 * @returns SVG content for the gradient background.
 */
const createGradient = (
  width: number,
  height: number,
  baseColor: string,
): string => {
  const { variantA, variantB } = getGradientVariants(baseColor);

  return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs>
          <radialGradient id="topLeft" cx="0%" cy="10%" r="90%">
            <stop offset="0%" style="stop-color:${variantA};stop-opacity:0.6" />
            <stop offset="100%" style="stop-color:${baseColor};stop-opacity:0" />
          </radialGradient>
          <radialGradient id="bottomRight" cx="100%" cy="100%" r="80%">
            <stop offset="0%" style="stop-color:${variantB};stop-opacity:0.6" />
            <stop offset="100%" style="stop-color:${baseColor};stop-opacity:0" />
          </radialGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="${baseColor}" />
        <rect width="${width}" height="${height}" fill="url(#topLeft)" />
        <rect width="${width}" height="${height}" fill="url(#bottomRight)" />
      </svg>
    `.trim();
};

/**
 * Generate an Android drawable XML string with a radial gradient.
 * @returns XML content for the drawable.
 */
export const createAndroidDrawable = (baseColor: string): string => {
  const { variantA, variantB } = getGradientVariants(baseColor);

  return `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape>
            <solid android:color="${baseColor}" />
        </shape>
    </item>
    <item>
        <shape>
            <gradient
                android:type="radial"
                android:gradientRadius="90%"
                android:centerX="0.0"
                android:centerY="0.1"
                android:startColor="${variantA}"
                android:endColor="@android:color/transparent" />
        </shape>
    </item>
    <item>
        <shape>
            <gradient
                android:type="radial"
                android:gradientRadius="80%"
                android:centerX="1.0"
                android:centerY="1.0"
                android:startColor="${variantB}"
                android:endColor="@android:color/transparent" />
        </shape>
    </item>
</layer-list>`;
};

/**
 * Create a radial gradient buffer.
 * @returns A PNG buffer containing the generated gradient.
 */
export const createGradientBuffer = async (
  size: number,
  baseColor: string,
): Promise<Buffer> => {
  const svg = createGradient(size, size, baseColor);
  return await sharp(Buffer.from(svg)).png().toBuffer();
};

import { createTheme, type MantineColorsTuple } from "@mantine/core";

import { type TailwindPalette, tailwindColors } from "./tailwind-colors";

/** Tailwind palette used for grays, borders, and dark-mode surfaces. */
const NEUTRAL = "neutral" as const;
/** Tailwind palette used as the primary/accent color. */
const PRIMARY = "blue" as const;

/**
 * Convert an 11-shade Tailwind palette (50…950) into a Mantine 10-shade tuple
 * by dropping the 950 shade, so index N maps to Tailwind shade (N+1)·100
 * (index 0 = 50, index 5 = 500, index 9 = 900).
 */
const toTuple = (palette: TailwindPalette): MantineColorsTuple =>
  palette.slice(0, 10) as unknown as MantineColorsTuple;

/**
 * Build Mantine's special `dark` tuple, which is ordered light → dark and
 * drives dark-mode surfaces (index 7 = body background, 6 = elevated surfaces,
 * 4 = borders, 0 = text). Tailwind neutrals don't map linearly, so the darker
 * shades are placed at the high indices.
 */
const toDarkTuple = (p: TailwindPalette): MantineColorsTuple =>
  [
    p[1], // 100 → text
    p[2], // 200
    p[4], // 400 → dimmed text
    p[5], // 500 → placeholder
    p[6], // 600 → borders
    p[7], // 700 → hover
    p[8], // 800 → elevated surfaces (cards, inputs)
    p[9], // 900 → body background
    p[10], // 950
    p[10], // 950
  ] as unknown as MantineColorsTuple;

const colors = Object.fromEntries(
  Object.entries(tailwindColors).map(([name, palette]) => [
    name,
    toTuple(palette),
  ]),
) as Record<string, MantineColorsTuple>;

// Mantine reserves `dark` for dark-mode surfaces and `gray` for light-mode
// neutrals - point both at the chosen Tailwind neutral family.
colors.dark = toDarkTuple(tailwindColors[NEUTRAL]);
colors.gray = toTuple(tailwindColors[NEUTRAL]);

export const theme = createTheme({
  colors,
  primaryColor: PRIMARY,
  // Light: shade 6 (Tailwind 600). Dark: shade 5 (Tailwind 500), brighter for
  // contrast against dark surfaces.
  primaryShade: { light: 6, dark: 5 },
  white: "#ffffff",
  // Softer than pure black for body text (Tailwind neutral-900).
  black: tailwindColors[NEUTRAL][9],
});

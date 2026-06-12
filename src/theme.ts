import {
  createTheme,
  defaultVariantColorsResolver,
  type MantineColorsTuple,
} from "@mantine/core";

import { type TailwindPalette, tailwindColors } from "./tailwind-colors";

/** Tailwind palette used for grays, borders, and dark-mode surfaces. */
const NEUTRAL = "neutral" as const;
/**
 * Primary/accent color. shadcn's signature is a *neutral* primary (near-black
 * in light mode, near-white in dark) rather than a saturated accent, so the
 * primary points at the neutral family and the shade is picked per scheme.
 */
const PRIMARY = NEUTRAL;

/**
 * System font stack (matches shadcn's `font-sans` closely without bundling a
 * webfont). Swap in Inter/Geist here later if we want.
 */
const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

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
  /*
   * Mantine's default resolver bakes the filled text color once, from the
   * *light-mode* primary shade (it has no color-scheme context), then reuses it
   * in both schemes. Because our neutral primary flips dark<->light per scheme,
   * that gives white-on-white text in dark mode. Route filled-primary text
   * through the scheme-aware `--mantine-primary-color-contrast` var instead
   * (pinned per scheme in theme.css).
   */
  variantColorResolver: (input) => {
    const resolved = defaultVariantColorsResolver(input);
    const isPrimary = input.color == null || input.color === PRIMARY;
    if (input.variant === "filled" && isPrimary) {
      return { ...resolved, color: "var(--mantine-primary-color-contrast)" };
    }
    return resolved;
  },
  primaryColor: PRIMARY,
  // Neutral primary: near-black surface in light mode (shade 8 = Tailwind 900),
  // near-white in dark mode (shade 0 = Tailwind 50). autoContrast then flips the
  // text/icon color so filled controls stay legible in both schemes.
  primaryShade: { light: 8, dark: 0 },
  autoContrast: true,
  fontFamily: FONT_FAMILY,
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  headings: { fontFamily: FONT_FAMILY, fontWeight: "600" },
  // shadcn uses a consistent ~0.5rem radius across components.
  defaultRadius: "md",
  white: "#ffffff",
  // Softer than pure black for body text (Tailwind neutral-900).
  black: tailwindColors[NEUTRAL][9],
  components: {
    // The Checkbox check is its own var (`--checkbox-icon-color`, defaulting to
    // white) and bypasses the variant resolver above - so on the near-white
    // checked box in dark mode the white tick disappears. Point it at the same
    // scheme-aware contrast var so the tick flips with the box.
    Checkbox: {
      defaultProps: { iconColor: "var(--mantine-primary-color-contrast)" },
    },
  },
});

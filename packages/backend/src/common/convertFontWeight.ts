import { FontWeightNumber } from "types";

// Convert generic named weights to numbers, which is the way tailwind understands.
//
// Matches by substring/pattern rather than a single exact-match after
// stripping spaces/dashes: a plain exact match fails on any compound style
// name (e.g. "Bold Italic" -> "bolditalic" matches nothing below and used
// to silently fall back to "400", the wrong weight for a bold style just
// because it also carried an italic flag). "heavy" maps to "900" (Figma/
// CSS convention treats it as black-adjacent, alongside "black"), not
// "800" -- this used to disagree with the WordPress-side equivalents of
// this same lookup (`wordpress/fromSelection/designBundleTextStyles.ts`'s
// `fontStyleToWeight`, `wordpress/theme/googleFonts.ts`'s
// `normalizeFontWeight`), which already agreed on 900.
export const convertFontWeight = (weight: string): FontWeightNumber | null => {
  const style = weight.toLowerCase();
  const patterns: Array<[RegExp, FontWeightNumber]> = [
    [/thin/, "100"],
    [/extra ?-?light|ultra ?-?light/, "200"],
    [/\blight\b/, "300"],
    [/medium/, "500"],
    [/extra ?-?bold|ultra ?-?bold/, "800"],
    [/semi ?-?bold|demi ?-?bold/, "600"],
    [/\bbold\b/, "700"],
    [/black|heavy/, "900"],
    [/regular|normal/, "400"],
  ];
  for (const [pattern, mapped] of patterns) {
    if (pattern.test(style)) return mapped;
  }
  return "400";
};

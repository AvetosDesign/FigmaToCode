import { FontWeightNumber } from "types";

// Convert generic named weights to numbers, which is the way tailwind understands.
//
// Matches by substring/pattern (see XC46)
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

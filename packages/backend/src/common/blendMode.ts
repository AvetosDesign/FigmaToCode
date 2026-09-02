/**
 * The 15 of Figma's 18 blend modes CSS `mix-blend-mode` has a native
 * keyword for -- everything but NORMAL/PASS_THROUGH (both mean "no
 * blending," so callers leave blendMode undefined for them rather than
 * modeling it as a value) and LINEAR_BURN/LINEAR_DODGE (a different
 * blend formula than color-burn/color-dodge, with no CSS equivalent).
 * Shared by the HTML and Tailwind backends, which used to each keep
 * their own independently-maintained copy of this same table.
 */
export type CssBlendMode =
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export const CSS_BLEND_MODE_BY_FIGMA_BLEND_MODE: Record<
  string,
  CssBlendMode
> = {
  MULTIPLY: "multiply",
  SCREEN: "screen",
  OVERLAY: "overlay",
  DARKEN: "darken",
  LIGHTEN: "lighten",
  COLOR_DODGE: "color-dodge",
  COLOR_BURN: "color-burn",
  HARD_LIGHT: "hard-light",
  SOFT_LIGHT: "soft-light",
  DIFFERENCE: "difference",
  EXCLUSION: "exclusion",
  HUE: "hue",
  SATURATION: "saturation",
  COLOR: "color",
  LUMINOSITY: "luminosity",
};

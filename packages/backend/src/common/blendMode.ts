/**
 * Figma's non-default blend modes (everything but NORMAL/PASS_THROUGH,
 * which every consumer below already treats as "no declaration needed")
 * mapped to their real CSS `mix-blend-mode`/`background-blend-mode`
 * keyword. This table used to be reimplemented independently in three
 * places -- `html/builderImpl/htmlBlend.ts`'s `htmlBlendMode`,
 * `tailwind/builderImpl/tailwindBlend.ts`'s `tailwindBlendMode` (prefixed
 * with "mix-blend-" for its own utility-class naming), and
 * `wordpress/fromSelection/designBundleTree.ts`'s own copy -- with the
 * same 14 entries maintained by hand in all three. Anything that emits a
 * literal CSS blend-mode keyword should use this table instead of its own
 * switch/object; SwiftUI's `swiftuiBlend.ts` is intentionally NOT one of
 * those consumers, since it maps to SwiftUI's own `.camelCase` enum
 * member names (`.colorDodge`, `.hardLight`, ...), not CSS keywords.
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

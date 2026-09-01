/**
 * Shared Figma auto-layout alignment -> CSS flexbox alignment mapping.
 *
 * Figma's `primaryAxisAlignItems`/`counterAxisAlignItems` (and WordPress's
 * `DesignBundleLayout` equivalents `primaryAxisAlign`/`counterAxisAlign`,
 * which use the same string literals) map onto CSS `justify-content` and
 * `align-items` almost 1:1 — only the keyword names differ. This was
 * previously duplicated between html's `htmlAutoLayout.ts` and
 * WordPress's `styleHelpers.ts`; both now delegate here.
 *
 * The parameter is typed as accepting `undefined` even though Figma's own
 * `AutoLayoutMixin.primaryAxisAlignItems`/`counterAxisAlignItems` and
 * WordPress's `DesignBundleLayout` fields are non-optional, to preserve
 * html's pre-existing defensive handling for any caller that hasn't
 * narrowed the value yet.
 */

export type PrimaryAxisAlign = "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
export type CounterAxisAlign = "MIN" | "CENTER" | "MAX" | "BASELINE";

export const primaryAxisAlignToCss = (
  align: PrimaryAxisAlign | undefined,
): string => {
  switch (align) {
    case undefined:
    case "MIN":
      return "flex-start";
    case "CENTER":
      return "center";
    case "MAX":
      return "flex-end";
    case "SPACE_BETWEEN":
      return "space-between";
  }
};

/** BASELINE maps 1:1 -- CSS has the same keyword. */
export const counterAxisAlignToCss = (
  align: CounterAxisAlign | undefined,
): string => {
  switch (align) {
    case undefined:
    case "MIN":
      return "flex-start";
    case "CENTER":
      return "center";
    case "MAX":
      return "flex-end";
    case "BASELINE":
      return "baseline";
  }
};

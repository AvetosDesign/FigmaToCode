/**
 * Shared Figma auto-layout alignment -> CSS flexbox alignment mapping.
 * (XC45)
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

/**
 * F2C port, stage 2. Restored from git history (commit
 * `7ce9238`, packages/backend/src/designBundle/designBundleTextStyles.ts)
 * -- see designBundleTree.ts's doc comment for context. Only the type
 * import source changed (`../core/types/designBundle` instead of the
 * public `"types"` package); logic is unchanged.
 */
import { DesignBundleTextStyle, DesignNode } from "../core/types/designBundle";
import { commonLineHeight } from "../../common/commonTextHeightSpacing";
import { convertFontWeight } from "../../common/convertFontWeight";

/**
 * Best-effort numeric font-weight string from a Figma FontName's `style`
 * (e.g. "Regular", "Semi Bold", "Black Italic"). Figma's TextStyle object
 * has no numeric weight field directly — only the human-readable style
 * name. Delegates to the shared `common/convertFontWeight` keyword-match
 * table (same "thin"/"semi bold"/"black" etc. patterns, most-specific
 * first) instead of keeping an independent copy here -- that table also
 * recognizes hyphenated variants ("extra-light", "semi-bold", ...) this
 * file's own copy didn't, and a second copy could only ever drift from
 * it. `convertFontWeight` already falls back to "400" internally; the
 * `?? "400"` here just satisfies its `| null` return type.
 */
export const fontStyleToWeight = (styleName: string | undefined): string =>
  convertFontWeight(styleName ?? "") ?? "400";

/** Recursively collects every distinct textStyleId referenced by a design's TEXT nodes. */
export const collectTextStyleIds = (
  node: DesignNode,
  into: Set<string> = new Set(),
): Set<string> => {
  for (const segment of node.text?.segments ?? []) {
    if (segment.textStyleId) into.add(segment.textStyleId);
  }
  for (const child of node.children) {
    collectTextStyleIds(child, into);
  }
  return into;
};

/**
 * Resolves a set of textStyleIds against Figma's style registry
 * (`getStyleByIdAsync`) into the bundle's `styles.textStyles` dictionary.
 * Done as a separate pass after tree-building rather than inline in
 * `buildDesignNode`, since `buildDesignNode` is synchronous (matches the
 * existing colors/variables handling in `designBundleTree.ts`, which never
 * needs an async call because bound-variable data is already present
 * synchronously on the paint object) and style resolution requires an
 * async Figma API call. Failures for an individual id are logged and
 * skipped rather than aborting the whole export — a missing/deleted style
 * shouldn't block the bundle.
 */
export const resolveTextStyles = async (
  textStyleIds: ReadonlySet<string>,
  target: Record<string, DesignBundleTextStyle>,
): Promise<string[]> => {
  const warnings: string[] = [];

  await Promise.all(
    Array.from(textStyleIds).map(async (id) => {
      if (target[id]) return;
      try {
        const style = await figma.getStyleByIdAsync(id);
        if (!style || style.type !== "TEXT") {
          warnings.push(
            `[design-bundle] textStyleId "${id}" did not resolve to a text style — skipped.`,
          );
          return;
        }
        const textStyle = style as TextStyle;
        const fontSize = textStyle.fontSize ?? 0;
        // Same unit as DesignBundleTextSegment.lineHeight (a px-per-fontSize
        // ratio, not raw px/percent) — computed the same way mapTextSegments
        // does in designBundleTree.ts, via the shared commonLineHeight
        // helper, so both are directly comparable.
        let lineHeightRatio = 0;
        try {
          const lineHeightPx = textStyle.lineHeight
            ? commonLineHeight(textStyle.lineHeight, fontSize)
            : 0;
          lineHeightRatio = fontSize > 0 ? (lineHeightPx || 0) / fontSize : 0;
        } catch {
          lineHeightRatio = 0;
        }

        target[id] = {
          name: textStyle.name,
          fontFamily: textStyle.fontName?.family ?? "",
          fontSize,
          fontWeight: fontStyleToWeight(textStyle.fontName?.style),
          lineHeight: lineHeightRatio,
        };
      } catch (error) {
        warnings.push(
          `[design-bundle] Failed to resolve textStyleId "${id}": ${(error as Error).message}`,
        );
      }
    }),
  );

  return warnings;
};

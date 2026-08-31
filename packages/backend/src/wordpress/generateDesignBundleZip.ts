/**
 * Phase 9 (D125 follow-up to D122/D123): the "Design Bundle" download --
 * the raw, internal `DesignBundle` JSON + its exported assets, zipped up
 * for direct download rather than fed into `generateThemeFiles` the way
 * `generateWordPressTheme.ts` (D123) does. This is the closest thing to
 * the old Phase 7 standalone "Design Bundle" export button (D119 removed
 * it, D122 restored the selection-walking logic it depended on) --
 * rebuilt fresh per D122's roadmap note, using D122's
 * `buildBundleFromSelection` as the shared translation layer both
 * WordPress outputs now go through.
 *
 * Adapted from git history (`7ce9238`,
 * packages/backend/src/designBundle/designBundleZip.ts's
 * `generateDesignBundleZip`) with two real differences beyond the
 * import-source change every file in this directory needs: (1) takes
 * `assets: Record<string, Uint8Array>` (D122's `buildBundleFromSelection`
 * shape, keyed by `DesignBundleAsset.fileName`) instead of the old
 * `ExportedDesignBundleAsset[]` array -- there's no array form anywhere
 * in this fork to convert from; (2) this function now also calls
 * `buildBundleFromSelection` itself (the old file only zipped an
 * already-built bundle -- `designBundleMain.ts` did both steps together,
 * and that combined shape is what both this function and
 * `generateWordPressTheme.ts` mirror now).
 */
import { zipSync } from "fflate";
import type { PluginSettings } from "types";
import type { WordPressGenerationSummary } from "types";
import { buildBundleFromSelection } from "./fromSelection/buildBundleFromSelection";
import { toSlug } from "./core/slugify";
import { encodeText } from "./core/textEncoding";

export interface GenerateDesignBundleZipResult {
  zip: Uint8Array;
  fileName: string;
  warnings: string[];
  /** No patterns or font resolution happen for a raw Design Bundle -- `patternCount` is always 0 and the font arrays always empty here, distinguishing this from a real `generateWordPressTheme` result at render time (see `WordPressFeedbackPanel`). */
  summary: WordPressGenerationSummary;
}

export const generateDesignBundleZip = async (
  selection: readonly SceneNode[],
  settings: PluginSettings,
): Promise<GenerateDesignBundleZipResult> => {
  const { bundle, assets, warnings } = await buildBundleFromSelection(selection, settings);

  const files: Record<string, Uint8Array> = {
    "design-bundle.json": encodeText(JSON.stringify(bundle, null, 2)),
    ...assets,
  };

  let zip: Uint8Array;
  try {
    zip = zipSync(files, { level: 6 });
  } catch (error) {
    console.error("Design bundle zip creation failed:", error);
    throw new Error(
      "Failed to create design bundle archive. The selection might be too large or complex.",
    );
  }

  const rootName = toSlug(bundle.meta.figmaFileName || "design-bundle");

  return {
    zip,
    fileName: `${rootName}-design-bundle.zip`,
    warnings,
    summary: {
      designCount: bundle.designs.length,
      assetCount: Object.keys(assets).length,
      patternCount: 0,
      resolvedFontFamilies: [],
      unresolvedFontFamilies: [],
    },
  };
};

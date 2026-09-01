/**
 * The "Design Bundle" download -- the raw, internal `DesignBundle` JSON +
 * its exported assets, zipped up for direct download rather than fed
 * into `generateThemeFiles` the way `generateWordPressTheme.ts` does.
 * This is the closest thing to an old, since-removed standalone "Design
 * Bundle" export button -- rebuilt fresh using
 * `buildBundleFromSelection` as the shared translation layer both
 * WordPress outputs now go through.
 *
 * Adapted from git history (`7ce9238`,
 * packages/backend/src/designBundle/designBundleZip.ts's
 * `generateDesignBundleZip`) with two real differences beyond the
 * import-source change every file in this directory needs: (1) takes
 * `assets: Record<string, Uint8Array>` (`buildBundleFromSelection`'s
 * shape, keyed by `DesignBundleAsset.fileName`) instead of the old
 * `ExportedDesignBundleAsset[]` array -- there's no array form anywhere
 * in this fork to convert from; (2) this function now also calls
 * `buildBundleFromSelection` itself (the old file only zipped an
 * already-built bundle -- `designBundleMain.ts` did both steps together,
 * and that combined shape is what both this function and
 * `generateWordPressTheme.ts` mirror now).
 */
import { zipSync } from "fflate";
import { PluginSettings } from "types";
import { WordPressGenerationSummary } from "types";
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

export interface GenerateDesignBundleZipOptions {
  /** The WordPress tab's "Theme Name" field, relabeled "Bundle Name" for this output mode (same setting as `generateWordPressTheme`'s `themeName`, code.ts's `userPluginSettings.wpThemeName`) -- overrides this zip's own `fileName`. Blank/undefined falls back to `bundle.meta.figmaFileName`, same as before this option existed. */
  bundleName?: string;
}

export const generateDesignBundleZip = async (
  selection: readonly SceneNode[],
  settings: PluginSettings,
  options: GenerateDesignBundleZipOptions = {},
): Promise<GenerateDesignBundleZipResult> => {
  const { bundle, assets, warnings } = await buildBundleFromSelection(
    selection,
    settings,
  );

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

  const rootName = toSlug(
    options.bundleName?.trim() || bundle.meta.figmaFileName || "design-bundle",
  );

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

/**
 * Phase 9 (D122 follow-up, stage 2 of 2 part 2): the actual WP Theme call
 * site -- everything downstream of a live Figma selection needed to
 * produce a downloadable theme.zip. Ties together D122's restored
 * translation layer (`buildBundleFromSelection`) and D121's ported
 * generation logic (`generateThemeFiles`) with an in-memory `OutputSink`
 * and `fflate`'s `zipSync` (the same zipping mechanism
 * `zipGenerator.ts`'s `generateProjectZip` already uses for every other
 * framework's project download), so the plugin sandbox's message handler
 * (`apps/plugin/plugin-src/code.ts`) has exactly one function to call.
 *
 * Deliberately excludes "Design Bundle" mode -- see D122's roadmap note:
 * that output has no generation path of its own yet (D119 removed the
 * old standalone zip-building code and it's a separate, unscheduled
 * follow-up), so this only ever produces a theme.
 */
import { zipSync } from "fflate";
import type { PluginSettings } from "types";
import type { WordPressGenerationSummary } from "types";
import { buildBundleFromSelection } from "./fromSelection/buildBundleFromSelection";
import { generateThemeFiles } from "./theme/generateThemeFiles";
import { createInMemorySink } from "./core/outputSink";
import { toSlug } from "./core/slugify";

export interface GenerateWordPressThemeOptions {
  /** See `GenerateThemeOptions.cliVersion`'s own doc comment for why this fork requires an explicit version string rather than reading one off disk -- the caller (code.ts) supplies F2C's own plugin version. */
  pluginVersion: string;
}

export interface GenerateWordPressThemeResult {
  zip: Uint8Array;
  fileName: string;
  warnings: string[];
  summary: WordPressGenerationSummary;
}

export const generateWordPressTheme = async (
  selection: readonly SceneNode[],
  settings: PluginSettings,
  options: GenerateWordPressThemeOptions,
): Promise<GenerateWordPressThemeResult> => {
  const {
    bundle,
    assets,
    warnings: bundleWarnings,
  } = await buildBundleFromSelection(selection, settings);

  const sink = createInMemorySink();
  const themeResult = await generateThemeFiles(bundle, assets, sink, undefined, {
    downloadFonts: settings.wpIncludeFonts,
    cliVersion: options.pluginVersion,
  });

  const zip = zipSync(sink.files, { level: 6 });
  const themeSlug =
    themeResult.themeSlug || toSlug(bundle.meta.figmaFileName || "generated-theme");

  const warnings = [
    ...bundleWarnings,
    ...themeResult.warnings.map((warning) => warning.message),
  ];

  return {
    zip,
    fileName: `${themeSlug}-wp-theme.zip`,
    warnings,
    summary: {
      designCount: bundle.designs.length,
      assetCount: Object.keys(assets).length,
      patternCount: themeResult.patternSlugs.length,
      resolvedFontFamilies: themeResult.fonts.resolvedFamilies,
      unresolvedFontFamilies: themeResult.fonts.unresolvedFamilies,
    },
  };
};

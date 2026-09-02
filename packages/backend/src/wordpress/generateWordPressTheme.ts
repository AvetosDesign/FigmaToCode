/**
 * The actual WP Theme call site -- everything downstream of a live Figma
 * selection needed to produce a downloadable theme.zip. Ties together
 * the restored translation layer (`buildBundleFromSelection`) and the
 * ported generation logic (`generateThemeFiles`) with an in-memory
 * `OutputSink` and `fflate`'s `zipSync` (the same zipping mechanism
 * `zipGenerator.ts`'s `generateProjectZip` already uses for every other
 * framework's project download), so the plugin sandbox's message handler
 * (`apps/plugin/plugin-src/code.ts`) has exactly one function to call.
 *
 * Deliberately excludes "Design Bundle" mode -- that output has its own
 * call site, `generateDesignBundleZip` (invoked from
 * `apps/plugin/plugin-src/code.ts` alongside this function), rather than
 * being routed through here. This function only ever produces a theme.
 */
import { zipSync } from "fflate";
import { PluginSettings } from "types";
import { WordPressGenerationSummary } from "types";
import { buildBundleFromSelection } from "./fromSelection/buildBundleFromSelection";
import { generateThemeFiles } from "./theme/generateThemeFiles";
import { createInMemorySink } from "./core/outputSink";
import { toSlug } from "./core/slugify";

export interface GenerateWordPressThemeOptions {
  /** See `GenerateThemeOptions.cliVersion`'s own doc comment for why this fork requires an explicit version string rather than reading one off disk -- the caller (code.ts) supplies F2C's own plugin version. */
  pluginVersion: string;
  /** The WordPress tab's "Theme Name" field (code.ts's `userPluginSettings.wpThemeName`) -- passed straight through as `GenerateThemeOptions.themeName`, and slugified (see `toSlug` below) to also override the theme's internal slug (pattern-slug namespace, `functions.php` handle, and this result's own `fileName`), not just the style.css header. Blank/undefined falls back to `bundle.meta.figmaFileName`, same as before this option existed. */
  themeName?: string;
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

  const themeName = options.themeName?.trim() || undefined;
  const themeSlugOverride = themeName ? toSlug(themeName) : undefined;

  const sink = createInMemorySink();
  const themeResult = await generateThemeFiles(
    bundle,
    assets,
    sink,
    themeSlugOverride,
    {
      downloadFonts: settings.wpIncludeFonts,
      cliVersion: options.pluginVersion,
      themeName,
    },
  );

  const zip = zipSync(sink.files, { level: 6 });
  const themeSlug =
    themeResult.themeSlug ||
    toSlug(bundle.meta.figmaFileName || "generated-theme");

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

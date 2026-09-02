import { Download, LoaderCircle } from "lucide-react";
import {
  DownloadFormat,
  WordPressGenerationSummary,
  WordPressOutputMode,
  Warning,
} from "types";
import { Button } from "./ui/button";
import WarningsPanel from "./WarningsPanel";
import FormField from "./CustomPrefixInput";

/**
 * The WordPress tab's own download control and feedback panel. Split out
 * of CodePanel.tsx into their own small file since neither one is a
 * syntax-highlighted-code concern the way the rest of that file is.
 *
 * Both outputs are real now: "WP Theme" (`outputMode === "theme"`, see
 * `generateWordPressTheme.ts`) and "Design Bundle" (see
 * `generateDesignBundleZip.ts`) -- both go through code.ts's shared
 * `downloadWordPressOutput`, taking a `DownloadFormat` like every other
 * download button in the app. Follows the same single-icon, no-popover
 * visual pattern DownloadMenu.tsx already uses for Flutter/SwiftUI --
 * kept as its own component rather than folded into DownloadMenu, since
 * the two differ in icon, label and feedback-panel shape, not in the
 * type of value they hand back.
 */

const outputLabel: Record<WordPressOutputMode, string> = {
  theme: "WP Theme",
  designBundle: "Design Bundle",
};

// One shared text setting (code.ts's userPluginSettings.wpThemeName)
// behind two labels/help texts, since
// "Theme Name" doesn't read right once the selected output is a raw
// Design Bundle download rather than an installable WP theme.
const themeNameFieldLabel: Record<WordPressOutputMode, string> = {
  theme: "Theme Name",
  designBundle: "Bundle Name",
};

const themeNameFieldHelp: Record<WordPressOutputMode, string> = {
  theme:
    "Used as the \"Theme Name:\" header in the generated theme's style.css and as the downloaded file's name. Defaults to the loaded Figma file's name.",
  designBundle:
    "Used as the downloaded zip's file name. Defaults to the loaded Figma file's name.",
};

const themeNameFieldPlaceholder: Record<WordPressOutputMode, string> = {
  theme: "e.g. My Site Theme",
  designBundle: "e.g. My Site Bundle",
};

/**
 * The "Theme Name" text field CodePanel.tsx renders adjacent to the
 * "Include Fonts" checkbox in the WordPress tab's
 * "Download Options" group. Kept here rather than added to
 * codegenPreferenceOptions.ts's generic preference list because that
 * mechanism only models checkboxes (`individual_select`) and button-group
 * selects (`select`) -- a free-text field with a per-mode label needs its
 * own small component, the same reasoning TailwindSettings.tsx's
 * "Advanced Settings" fields already follow for Tailwind's tab. Uses the
 * same `FormField` those fields use (from CustomPrefixInput.tsx), with
 * the default `disallowedPattern` (blocks whitespace) overridden since a
 * theme/file name routinely has spaces -- only filesystem-hostile
 * characters are blocked here instead, since this value ends up in a
 * generated file name either way (`toSlug()` in
 * generateWordPressTheme.ts/generateDesignBundleZip.ts).
 */
export const WordPressThemeNameField = ({
  outputMode,
  value,
  onChange,
}: {
  outputMode: WordPressOutputMode;
  value: string;
  onChange: (value: string) => void;
}) => {
  return (
    <FormField
      label={themeNameFieldLabel[outputMode]}
      initialValue={value}
      onValueChange={(newValue) => onChange(String(newValue))}
      placeholder={themeNameFieldPlaceholder[outputMode]}
      helpText={themeNameFieldHelp[outputMode]}
      type="text"
      disallowedPattern={/[\\/:*?"<>|]/}
      disallowedMessage={'Cannot contain \\ / : * ? " < > |'}
    />
  );
};

export const WordPressDownloadButton = ({
  outputMode,
  onDownload,
  isDownloading = false,
}: {
  outputMode: WordPressOutputMode;
  onDownload?: (format: DownloadFormat) => void;
  isDownloading?: boolean;
}) => {
  const label = `Download ${outputLabel[outputMode]}`;
  const buttonLabel = isDownloading
    ? outputMode === "theme"
      ? "Creating theme…"
      : "Creating bundle…"
    : label;
  // Translate this tab's own outputMode vocabulary into the shared
  // DownloadFormat currency at the one boundary point where it's needed.
  const format: DownloadFormat =
    outputMode === "theme" ? "wordpress-theme" : "wordpress-design-bundle";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 bg-neutral-100 text-neutral-800 shadow-sm ring-1 ring-neutral-200 transition-colors duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-neutral-200 hover:text-neutral-950 dark:bg-neutral-800/90 dark:text-neutral-200 dark:ring-white/10 dark:hover:bg-neutral-600 dark:hover:text-white dark:hover:ring-white/20"
      aria-label={buttonLabel}
      title={buttonLabel}
      onClick={() => onDownload?.(format)}
      disabled={isDownloading || !onDownload}
    >
      {isDownloading ? (
        <span
          className="inline-flex animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        >
          <LoaderCircle className="h-4 w-4" />
        </span>
      ) : (
        <Download className="h-4 w-4" />
      )}
    </Button>
  );
};

const fontsSummary = (summary: WordPressGenerationSummary): string | null => {
  const { resolvedFontFamilies, unresolvedFontFamilies } = summary;
  if (
    resolvedFontFamilies.length === 0 &&
    unresolvedFontFamilies.length === 0
  ) {
    return null;
  }

  const parts: string[] = [];
  if (resolvedFontFamilies.length > 0) {
    parts.push(`self-hosted ${resolvedFontFamilies.join(", ")}`);
  }
  if (unresolvedFontFamilies.length > 0) {
    parts.push(
      `fell back to a generic font for ${unresolvedFontFamilies.join(", ")}`,
    );
  }
  return parts.join("; ");
};

type WordPressResult = {
  outputMode: WordPressOutputMode;
  fileName: string;
  warnings: Warning[];
  summary: WordPressGenerationSummary;
};

const placeholderCopy: Record<WordPressOutputMode, string> = {
  theme:
    "Click the download button above to generate a theme.zip from the current selection -- page/pattern/asset counts and mapping warnings will summarize here once it's ready.",
  designBundle:
    "Click the download button above to export the current selection as a Design Bundle (design-bundle.json plus its assets) -- design/asset counts and mapping warnings will summarize here once it's ready.",
};

export const WordPressFeedbackPanel = ({
  outputMode,
  result,
}: {
  outputMode: WordPressOutputMode;
  result?: WordPressResult | null;
}) => {
  // A stored result only applies to the currently-selected output --
  // switching from "WP Theme" to "Design Bundle" (or back) without
  // regenerating should fall through to the placeholder copy below, not
  // show the other output's stale counts under this one's heading.
  if (result && result.outputMode === outputMode) {
    const { summary } = result;
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{result.fileName}</p>
        {outputMode === "theme" ? (
          <p>
            {summary.designCount}{" "}
            {summary.designCount === 1 ? "design" : "designs"},{" "}
            {summary.patternCount}{" "}
            {summary.patternCount === 1 ? "pattern" : "patterns"}, and{" "}
            {summary.assetCount} {summary.assetCount === 1 ? "asset" : "assets"}{" "}
            exported.
            {(() => {
              const fonts = fontsSummary(summary);
              return fonts ? ` ${fonts}.` : "";
            })()}
          </p>
        ) : (
          <p>
            {summary.designCount}{" "}
            {summary.designCount === 1 ? "design" : "designs"} and{" "}
            {summary.assetCount} {summary.assetCount === 1 ? "asset" : "assets"}{" "}
            exported to <code>design-bundle.json</code>.
          </p>
        )}
        {result.warnings.length > 0 && (
          <WarningsPanel warnings={result.warnings} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">
        {outputLabel[outputMode]} feedback
      </p>
      <p>{placeholderCopy[outputMode]}</p>
    </div>
  );
};

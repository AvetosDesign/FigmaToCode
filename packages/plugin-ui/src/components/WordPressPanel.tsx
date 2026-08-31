import { Download, LoaderCircle } from "lucide-react";
import { WordPressGenerationSummary, WordPressOutputMode, Warning } from "types";
import { Button } from "./ui/button";
import WarningsPanel from "./WarningsPanel";

/**
 * Phase 9 (D115/D118, wired up per D122-D125): the WordPress tab's own
 * download control and feedback panel. Split out of CodePanel.tsx into
 * their own small file since neither one is a syntax-highlighted-code
 * concern the way the rest of that file is.
 *
 * Both outputs are real now: "WP Theme" (`outputMode === "theme"`, see
 * `generateWordPressTheme.ts`) since D123, "Design Bundle" (see
 * `generateDesignBundleZip.ts`) since D125 -- both go through
 * code.ts's shared `downloadWordPressOutput`. Follows the same
 * single-icon, no-popover visual pattern DownloadMenu.tsx already uses
 * for Flutter/SwiftUI -- kept as its own component rather than
 * extending DownloadMenu's props, since DownloadMenu's whole job is
 * resolving a `DownloadProjectFormat`, a type neither WordPress output
 * produces.
 */

const outputLabel: Record<WordPressOutputMode, string> = {
  theme: "WP Theme",
  designBundle: "Design Bundle",
};

export const WordPressDownloadButton = ({
  outputMode,
  onDownload,
  isDownloading = false,
}: {
  outputMode: WordPressOutputMode;
  onDownload?: (outputMode: WordPressOutputMode) => void;
  isDownloading?: boolean;
}) => {
  const label = `Download ${outputLabel[outputMode]}`;
  const buttonLabel = isDownloading
    ? outputMode === "theme"
      ? "Creating theme…"
      : "Creating bundle…"
    : label;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 bg-neutral-100 text-neutral-800 shadow-sm ring-1 ring-neutral-200 transition-colors duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-neutral-200 hover:text-neutral-950 dark:bg-neutral-800/90 dark:text-neutral-200 dark:ring-white/10 dark:hover:bg-neutral-600 dark:hover:text-white dark:hover:ring-white/20"
      aria-label={buttonLabel}
      title={buttonLabel}
      onClick={() => onDownload?.(outputMode)}
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
  if (resolvedFontFamilies.length === 0 && unresolvedFontFamilies.length === 0) {
    return null;
  }

  const parts: string[] = [];
  if (resolvedFontFamilies.length > 0) {
    parts.push(`self-hosted ${resolvedFontFamilies.join(", ")}`);
  }
  if (unresolvedFontFamilies.length > 0) {
    parts.push(`fell back to a generic font for ${unresolvedFontFamilies.join(", ")}`);
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
            {summary.designCount} {summary.designCount === 1 ? "design" : "designs"},{" "}
            {summary.patternCount} {summary.patternCount === 1 ? "pattern" : "patterns"}, and{" "}
            {summary.assetCount} {summary.assetCount === 1 ? "asset" : "assets"} exported.
            {(() => {
              const fonts = fontsSummary(summary);
              return fonts ? ` ${fonts}.` : "";
            })()}
          </p>
        ) : (
          <p>
            {summary.designCount} {summary.designCount === 1 ? "design" : "designs"} and{" "}
            {summary.assetCount} {summary.assetCount === 1 ? "asset" : "assets"} exported to{" "}
            <code>design-bundle.json</code>.
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

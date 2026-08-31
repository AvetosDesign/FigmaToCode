import { Download, LoaderCircle } from "lucide-react";
import { WordPressGenerationSummary, WordPressOutputMode, Warning } from "types";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import WarningsPanel from "./WarningsPanel";

/**
 * Phase 9 (D115/D118, wired up per D122's follow-up): the WordPress tab's
 * own download control and feedback panel. Split out of CodePanel.tsx
 * into their own small file since neither one is a syntax-highlighted-
 * code concern the way the rest of that file is.
 *
 * "WP Theme" (`outputMode === "theme"`) is real now -- see
 * `generateWordPressTheme.ts` (backend) and code.ts's
 * `downloadWordPressTheme` -- and follows the same single-icon,
 * no-popover visual pattern DownloadMenu.tsx already uses for Flutter/
 * SwiftUI. "Design Bundle" stays disabled (D122's roadmap note: D119
 * removed the old standalone zip-building code, and rebuilding it is a
 * separate, unscheduled follow-up) -- kept as its own component rather
 * than extending DownloadMenu's props, since DownloadMenu's whole job is
 * resolving a `DownloadProjectFormat`, a type this doesn't produce.
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
  const isReady = outputMode === "theme" && Boolean(onDownload);

  if (isReady) {
    const buttonLabel = isDownloading ? "Creating theme…" : label;
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 bg-neutral-100 text-neutral-800 shadow-sm ring-1 ring-neutral-200 transition-colors duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-neutral-200 hover:text-neutral-950 dark:bg-neutral-800/90 dark:text-neutral-200 dark:ring-white/10 dark:hover:bg-neutral-600 dark:hover:text-white dark:hover:ring-white/20"
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={() => onDownload?.(outputMode)}
        disabled={isDownloading}
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
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-not-allowed bg-neutral-100 text-neutral-400 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800/90 dark:text-neutral-500 dark:ring-white/10"
            aria-label={`${label} (not yet available)`}
            disabled
          />
        }
      >
        <Download className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent>
        {label} isn't wired up to real generation yet -- coming soon.
      </TooltipContent>
    </Tooltip>
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

export const WordPressFeedbackPanel = ({
  outputMode,
  result,
}: {
  outputMode: WordPressOutputMode;
  result?: {
    fileName: string;
    warnings: Warning[];
    summary: WordPressGenerationSummary;
  } | null;
}) => {
  if (outputMode === "theme" && result) {
    const { summary } = result;
    const fonts = fontsSummary(summary);
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{result.fileName}</p>
        <p>
          {summary.designCount} {summary.designCount === 1 ? "design" : "designs"},{" "}
          {summary.patternCount} {summary.patternCount === 1 ? "pattern" : "patterns"}, and{" "}
          {summary.assetCount} {summary.assetCount === 1 ? "asset" : "assets"} exported.
          {fonts ? ` ${fonts}.` : ""}
        </p>
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
      <p>
        {outputMode === "theme"
          ? 'Click the download button above to generate a theme.zip from the current selection -- page/pattern/asset counts and mapping warnings will summarize here once it\'s ready.'
          : "This panel will summarize what the Download button produces for the selected output -- page/template/pattern counts, asset counts, and mapping warnings (surfaced above, via the same warnings panel every other tab uses) -- once WordPress generation is wired up to real output. There's no generated code to preview here the way the other tabs show, since a WordPress export is a theme.zip or a Design Bundle zip, not source you'd read."}
      </p>
    </div>
  );
};

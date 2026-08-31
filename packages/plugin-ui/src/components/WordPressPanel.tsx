import { Download } from "lucide-react";
import { WordPressOutputMode } from "types";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/**
 * Phase 9 (D115/D118): the WordPress tab's own download control and
 * feedback panel. Split out of CodePanel.tsx into their own small file
 * since neither one is a syntax-highlighted-code concern the way the rest
 * of that file is -- this is the seam a future real generation wire-up
 * (producing an actual theme.zip/design-bundle.zip via the OutputSink/
 * fflate mechanism D117 already ported) will replace, without CodePanel
 * itself needing to change shape again.
 *
 * Deliberately disabled for now (D118) -- neither "WP Theme" nor "Design
 * Bundle" can produce real output yet; wp-figma-gen's generation logic
 * (theme-creator-for-figma's cli/src/core, cli/src/targets/wordpress)
 * hasn't been ported into this package's own backend. Follows the same
 * single-icon, no-popover visual pattern DownloadMenu.tsx already uses
 * for Flutter/SwiftUI, per D115's UI spec -- kept as its own component
 * rather than extending DownloadMenu's props, since DownloadMenu's whole
 * job is resolving a `DownloadProjectFormat`, a type this doesn't produce.
 */

const outputLabel: Record<WordPressOutputMode, string> = {
  theme: "WP Theme",
  designBundle: "Design Bundle",
};

export const WordPressDownloadButton = ({
  outputMode,
}: {
  outputMode: WordPressOutputMode;
}) => {
  const label = `Download ${outputLabel[outputMode]}`;
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

export const WordPressFeedbackPanel = ({
  outputMode,
}: {
  outputMode: WordPressOutputMode;
}) => {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">
        {outputLabel[outputMode]} feedback
      </p>
      <p>
        This panel will summarize what the Download button produces for the
        selected output -- page/template/pattern counts, asset counts, and
        mapping warnings (surfaced above, via the same warnings panel every
        other tab uses) -- once WordPress generation is wired up to real
        output. There's no generated code to preview here the way the other
        tabs show, since a WordPress export is a theme.zip or a Design
        Bundle zip, not source you'd read.
      </p>
    </div>
  );
};

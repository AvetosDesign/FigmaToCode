import copy from "copy-to-clipboard";
import Preview from "./components/Preview";
import GradientsPanel from "./components/GradientsPanel";
import ColorsPanel from "./components/ColorsPanel";
import CodePanel from "./components/CodePanel";
import EmptyState from "./components/EmptyState";
import About from "./components/About";
import WarningsPanel from "./components/WarningsPanel";
import {
  Framework,
  DownloadProjectFormat,
  HTMLPreview,
  LinearGradientConversion,
  PluginSettings,
  SolidColorConversion,
  Warning,
} from "types";
import {
  preferenceOptions,
  selectPreferenceOptions,
} from "./codegenPreferenceOptions";
import Loading from "./components/Loading";
import { useEffect, useState } from "react";
import { InfoIcon, PackageOpen, LoaderCircle } from "lucide-react";
import React from "react";
import { Button } from "./components/ui/button";
import { ScrollArea } from "./components/ui/scroll-area";
import { TooltipProvider } from "./components/ui/tooltip";

type PluginUIProps = {
  code: string;
  htmlPreview: HTMLPreview;
  warnings: Warning[];
  selectedFramework: Framework;
  setSelectedFramework: (framework: Framework) => void;
  settings: PluginSettings | null;
  onPreferenceChanged: (
    key: keyof PluginSettings,
    value: PluginSettings[keyof PluginSettings],
  ) => void;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  isLoading: boolean;
  onDownloadProject?: (format: DownloadProjectFormat) => void;
  isDownloadingProject?: boolean;
  projectDownloadError?: string | null;
  onExportDesignBundle?: () => void;
  isExportingDesignBundle?: boolean;
  designBundleExportError?: string | null;
  designBundleWarnings?: Warning[];
};

// Phase 9 (D115): "WordPress" added as a fifth tab, peer to the code-
// generation frameworks -- not itself a code-generation language (see
// CodePanel's dedicated WordPress branch). "Compose" stays deliberately
// unlisted here, same as before this change -- it has real preference
// options (composeGenerationMode) but isn't surfaced as a top-level tab.
const frameworks: Framework[] = [
  "HTML",
  "Tailwind",
  "Flutter",
  "SwiftUI",
  "WordPress",
];
const LOADING_INDICATOR_DELAY_MS = 250;

const DelayedLoading = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setVisible(true),
      LOADING_INDICATOR_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  return visible ? <Loading /> : null;
};

type FrameworkTabsProps = {
  frameworks: Framework[];
  selectedFramework: Framework;
  setSelectedFramework: (framework: Framework) => void;
  showAbout: boolean;
  setShowAbout: (show: boolean) => void;
};

const FrameworkTabs = ({
  frameworks,
  selectedFramework,
  setSelectedFramework,
  showAbout,
  setShowAbout,
}: FrameworkTabsProps) => {
  return (
    <div className="grid grid-cols-5 sm:grid-cols-3 md:grid-cols-5 gap-1 grow">
      {frameworks.map((tab) => {
        const isSelected = selectedFramework === tab && !showAbout;
        // Phase 9 (D115): "a green WordPress tab" -- distinguishes it from
        // the blue/primary code-generation frameworks, consistent with
        // green already being this UI's own accent color elsewhere
        // (SettingsGroup's toggle checkmarks, CodePanel's hover ring).
        const isWordPress = tab === "WordPress";
        return (
          <Button
            variant="ghost"
            size="sm"
            key={`tab ${tab}`}
            aria-pressed={isSelected}
            className={`w-full h-8 rounded-md text-sm ${
              isSelected
                ? isWordPress
                  ? "bg-green-600 text-white shadow-xs hover:bg-green-600 hover:text-white dark:bg-green-600 dark:hover:bg-green-600"
                  : "bg-primary text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
                : isWordPress
                  ? "bg-muted text-green-700 hover:bg-green-600/90 hover:text-white dark:text-green-400 dark:hover:bg-green-600/90 dark:hover:text-white"
                  : "bg-muted text-foreground hover:bg-primary/90 hover:text-primary-foreground dark:hover:bg-primary/90"
            }`}
            onClick={() => {
              setSelectedFramework(tab as Framework);
              setShowAbout(false);
            }}
          >
            {tab}
          </Button>
        );
      })}
    </div>
  );
};

export const PluginUI = (props: PluginUIProps) => {
  const [showAbout, setShowAbout] = useState(false);

  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewViewMode, setPreviewViewMode] = useState<
    "desktop" | "mobile" | "precision"
  >("precision");
  const [previewBgColor, setPreviewBgColor] = useState<"white" | "black">(
    "white",
  );

  if (props.isLoading) {
    return <DelayedLoading />;
  }

  const isEmpty = props.code === "";
  const warnings = props.warnings ?? [];

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
        <div className="px-2 py-1.5 dark:bg-card">
          <div className="flex gap-1 bg-muted dark:bg-card rounded-lg p-0.5">
            <FrameworkTabs
              frameworks={frameworks}
              selectedFramework={props.selectedFramework}
              setSelectedFramework={props.setSelectedFramework}
              showAbout={showAbout}
              setShowAbout={setShowAbout}
            />
            {props.onExportDesignBundle && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md bg-neutral-100 text-neutral-800 shadow-sm ring-1 ring-neutral-200 transition-colors duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-neutral-200 hover:text-neutral-950 dark:bg-neutral-800/90 dark:text-neutral-200 dark:ring-white/10 dark:hover:bg-neutral-600 dark:hover:text-white dark:hover:ring-white/20"
                aria-label="Export Design Bundle"
                title="Export Design Bundle (design-bundle.json + assets)"
                onClick={props.onExportDesignBundle}
                disabled={props.isExportingDesignBundle}
              >
                {props.isExportingDesignBundle ? (
                  <span
                    className="inline-flex animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  >
                    <LoaderCircle className="h-4 w-4" />
                  </span>
                ) : (
                  <PackageOpen className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 rounded-md ${
                showAbout
                  ? "bg-primary text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
                  : "bg-muted text-foreground hover:bg-primary/90 hover:text-primary-foreground dark:hover:bg-primary/90"
              }`}
              onClick={() => {
                setShowAbout(!showAbout);
              }}
              aria-label="About"
              aria-pressed={showAbout}
            >
              <InfoIcon size={16} />
            </Button>
          </div>
        </div>
        {(props.designBundleExportError ||
          (props.designBundleWarnings?.length ?? 0) > 0) && (
          <div className="flex flex-col gap-2 px-2 pt-1.5 dark:bg-card">
            {props.designBundleExportError && (
              <p className="text-sm text-destructive" role="alert">
                {props.designBundleExportError}
              </p>
            )}
            {props.designBundleWarnings &&
              props.designBundleWarnings.length > 0 && (
                <WarningsPanel warnings={props.designBundleWarnings} />
              )}
          </div>
        )}
        <div
          style={{
            height: 1,
            width: "100%",
            backgroundColor: "rgba(255,255,255,0.12)",
          }}
        ></div>
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          {showAbout ? (
            <About
              useOldPluginVersion={props.settings?.useOldPluginVersion2025}
              onPreferenceChanged={props.onPreferenceChanged}
            />
          ) : isEmpty ? (
            <div className="flex min-h-full items-center justify-center">
              <EmptyState />
            </div>
          ) : (
            <div className="flex flex-col items-center px-4 pt-3 pb-2 gap-2 dark:bg-transparent">
              {props.htmlPreview && (
                <Preview
                  htmlPreview={props.htmlPreview}
                  expanded={previewExpanded}
                  setExpanded={setPreviewExpanded}
                  viewMode={previewViewMode}
                  setViewMode={setPreviewViewMode}
                  bgColor={previewBgColor}
                  setBgColor={setPreviewBgColor}
                />
              )}

              {warnings.length > 0 && <WarningsPanel warnings={warnings} />}

              <CodePanel
                code={props.code}
                selectedFramework={props.selectedFramework}
                preferenceOptions={preferenceOptions}
                selectPreferenceOptions={selectPreferenceOptions}
                settings={props.settings}
                onPreferenceChanged={props.onPreferenceChanged}
                onDownloadProject={props.onDownloadProject}
                isDownloadingProject={props.isDownloadingProject}
                projectDownloadError={props.projectDownloadError}
              />

              {props.colors.length > 0 && (
                <div className="mt-3 w-full">
                  <ColorsPanel
                    colors={props.colors}
                    onColorClick={(value) => {
                      copy(value);
                    }}
                  />
                </div>
              )}

              {props.gradients.length > 0 && (
                <div className="mt-3 w-full">
                  <GradientsPanel
                    gradients={props.gradients}
                    onColorClick={(value) => {
                      copy(value);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
};

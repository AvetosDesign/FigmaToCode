import { useEffect, useState } from "react";
import { PluginUI } from "plugin-ui";
import {
  Framework,
  PluginSettings,
  ConversionMessage,
  Message,
  HTMLPreview,
  LinearGradientConversion,
  SolidColorConversion,
  ErrorMessage,
  SettingsChangedMessage,
  Warning,
  DownloadFormat,
  DownloadErrorMessage,
  DownloadZipMessage,
  WordPressOutputMode,
  WordPressGenerationSummary,
} from "types";
import { postUISettingsChangingMessage } from "./messaging";
import copy from "copy-to-clipboard";

interface AppState {
  code: string;
  selectedFramework: Framework;
  isLoading: boolean;
  htmlPreview: HTMLPreview;
  settings: PluginSettings | null;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  warnings: Warning[];
  // Shared by every framework's download flow, WordPress included --
  // previously WordPress tracked its own separate
  // isDownloadingWordPress/wordPressDownloadError pair even though the
  // plugin sandbox only ever allowed one download (of either kind) to
  // run at a time anyway (see code.ts's shared isDownloading guard).
  isDownloading: boolean;
  downloadError: string | null;
  // Set by the "empty"/"code" backend messages (see XC10)
  isEmptySelection: boolean;
  // Last successful WordPress generation summary (see XC12). Only ever
  // populated by a WordPress-format download -- the other five formats'
  // "zip" messages carry no summary to store here.
  wordPressResult: {
    outputMode: WordPressOutputMode;
    fileName: string;
    warnings: Warning[];
    summary: WordPressGenerationSummary;
  } | null;
}

const emptyPreview = { size: { width: 0, height: 0 }, content: "" };
const isDarkFigmaBackground = (background: string) => {
  const value = background.trim().toLowerCase();

  return Boolean(
    value &&
    value !== "#fff" &&
    value !== "#ffffff" &&
    value !== "rgb(255, 255, 255)" &&
    value !== "rgba(255, 255, 255, 1)",
  );
};

// Shared download-trigger for both zip message cases below: build a
// Blob, click a hidden <a download>, then revoke the object URL. The
// two cases differ only in the AppState fields they set afterward
// (wordpress-zip also carries a generation summary) -- see App.tsx's
// own review notes on why *that* tail stays separate.
const triggerZipDownload = (zip: ArrayBuffer, fileName: string) => {
  const blob = new Blob([zip], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

// The two wordpress-* DownloadFormat values are the only ones a "zip"
// message's optional `summary` field is ever populated for -- this
// recovers the WordPressOutputMode the WordPress feedback panel already
// expects from the format value the merged download protocol carries
// instead of a separate `outputMode` field.
const formatToWordPressOutputMode = (format: DownloadFormat): WordPressOutputMode =>
  format === "wordpress-design-bundle" ? "designBundle" : "theme";

export default function App() {
  const [state, setState] = useState<AppState>({
    code: "",
    selectedFramework: "HTML",
    isLoading: true,
    htmlPreview: emptyPreview,
    settings: null,
    colors: [],
    gradients: [],
    warnings: [],
    isDownloading: false,
    downloadError: null,
    isEmptySelection: true,
    wordPressResult: null,
  });

  const rootStyles = getComputedStyle(document.documentElement);
  const figmaColorBgValue = rootStyles
    .getPropertyValue("--figma-color-bg")
    .trim();

  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const untypedMessage = event.data.pluginMessage as Message;
      console.log("[ui] message received:", untypedMessage);

      switch (untypedMessage.type) {
        case "conversionStart":
          setState((prevState) => ({
            ...prevState,
            code: "",
            isLoading: true,
          }));
          break;

        case "code":
          const conversionMessage = untypedMessage as ConversionMessage;
          setState((prevState) => ({
            ...prevState,
            ...conversionMessage,
            selectedFramework: conversionMessage.settings.framework,
            isLoading: false,
            isEmptySelection: false,
          }));
          break;

        case "pluginSettingsChanged":
          const settingsMessage = untypedMessage as SettingsChangedMessage;
          setState((prevState) => ({
            ...prevState,
            settings: settingsMessage.settings,
            selectedFramework: settingsMessage.settings.framework,
          }));
          break;

        case "empty":
          // const emptyMessage = untypedMessage as EmptyMessage;
          setState((prevState) => ({
            ...prevState,
            code: "",
            htmlPreview: emptyPreview,
            warnings: [],
            colors: [],
            gradients: [],
            isLoading: false,
            isEmptySelection: true,
          }));
          break;

        case "error":
          const errorMessage = untypedMessage as ErrorMessage;

          setState((prevState) => ({
            ...prevState,
            colors: [],
            gradients: [],
            code: `Error :(\n// ${errorMessage.error}`,
            isLoading: false,
            isEmptySelection: false,
          }));
          break;

        case "selection-json":
          const json = event.data.pluginMessage.data;
          copy(JSON.stringify(json, null, 2));
          break;

        case "zip": {
          const zipMessage = untypedMessage as DownloadZipMessage;
          triggerZipDownload(zipMessage.zip, zipMessage.fileName);
          setState((prevState) => ({
            ...prevState,
            isDownloading: false,
            downloadError: null,
            // Only WordPress's two formats carry a summary -- for the
            // other five, leave whatever wordPressResult was already
            // there (there's nothing to update it with) rather than
            // clearing it out from under an unrelated download.
            wordPressResult:
              zipMessage.summary !== undefined
                ? {
                    outputMode: formatToWordPressOutputMode(zipMessage.format),
                    fileName: zipMessage.fileName,
                    warnings: zipMessage.warnings ?? [],
                    summary: zipMessage.summary,
                  }
                : prevState.wordPressResult,
          }));
          break;
        }

        case "download-error": {
          const downloadError = untypedMessage as DownloadErrorMessage;
          setState((prevState) => ({
            ...prevState,
            isDownloading: false,
            downloadError: downloadError.error,
          }));
          break;
        }

        default:
          break;
      }
    };

    return () => {
      window.onmessage = null;
    };
  }, []);

  useEffect(() => {
    parent.postMessage({ pluginMessage: { type: "ui-ready" } }, "*");
  }, []);

  const handleFrameworkChange = (updatedFramework: Framework) => {
    if (updatedFramework !== state.selectedFramework) {
      setState((prevState) => ({
        ...prevState,
        // code: "// Loading...",
        selectedFramework: updatedFramework,
      }));
      postUISettingsChangingMessage("framework", updatedFramework, {
        targetOrigin: "*",
      });
    }
  };
  const handlePreferencesChange = (
    key: keyof PluginSettings,
    value: PluginSettings[keyof PluginSettings],
  ) => {
    if (state.settings && state.settings[key] === value) {
      // do nothing
    } else {
      postUISettingsChangingMessage(key, value, { targetOrigin: "*" });
    }
  };
  const handleDownload = (format: DownloadFormat) => {
    if (state.isDownloading) {
      return;
    }

    setState((prevState) => ({
      ...prevState,
      isDownloading: true,
      downloadError: null,
    }));
    parent.postMessage({ pluginMessage: { type: "download", format } }, "*");
  };
  const darkMode = isDarkFigmaBackground(figmaColorBgValue);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);

    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, [darkMode]);

  return (
    <div
      className={`${darkMode ? "dark" : ""} h-full bg-background text-foreground`}
    >
      <PluginUI
        isLoading={state.isLoading}
        code={state.code}
        warnings={state.warnings}
        selectedFramework={state.selectedFramework}
        setSelectedFramework={handleFrameworkChange}
        onPreferenceChanged={handlePreferencesChange}
        htmlPreview={state.htmlPreview}
        settings={state.settings}
        colors={state.colors}
        gradients={state.gradients}
        onDownload={handleDownload}
        isDownloading={state.isDownloading}
        downloadError={state.downloadError}
        isEmptySelection={state.isEmptySelection}
        wordPressResult={state.wordPressResult}
      />
    </div>
  );
}

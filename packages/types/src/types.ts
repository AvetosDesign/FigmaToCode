import "@figma/plugin-typings";
// Settings
export type Framework =
  | "Flutter"
  | "SwiftUI"
  | "HTML"
  | "Tailwind"
  | "Compose"
  // Figma -> WordPress pipeline (see XC28)
  | "WordPress";
export interface HTMLSettings {
  showLayerNames: boolean;
  embedImages: boolean;
  embedVectors: boolean;
  useColorVariables: boolean;
  htmlGenerationMode: "html" | "jsx" | "styled-components" | "svelte";
  imagePlaceholderMode?: "remote" | "asset";
}
export interface TailwindSettings extends HTMLSettings {
  tailwindGenerationMode: "html" | "jsx" | "twig";
  roundTailwindValues: boolean;
  roundTailwindColors: boolean;
  useColorVariables: boolean;
  customTailwindPrefix?: string;
  embedVectors: boolean;
  baseFontSize: number;
  useTailwind4: boolean;
  thresholdPercent: number;
  baseFontFamily: string;
  fontFamilyCustomConfig: Record<string, string[]>;
}
export interface FlutterSettings {
  flutterGenerationMode: "fullApp" | "stateless" | "snippet";
}
export interface SwiftUISettings {
  swiftUIGenerationMode: "preview" | "struct" | "snippet";
}
export interface ComposeSettings {
  composeGenerationMode: "snippet" | "composable" | "screen";
}
/**
 * The WordPress tab's settings (see XC29)
 */
export type WordPressOutputMode = "theme" | "designBundle";
export interface WordPressSettings {
  wpOutputMode: WordPressOutputMode;
  wpIncludeFonts: boolean;
  /**
   * The WordPress tab's "Theme Name" field (see XC30)
   */
  wpThemeName: string;
}
export interface PluginSettings
  extends
    HTMLSettings,
    TailwindSettings,
    FlutterSettings,
    SwiftUISettings,
    ComposeSettings,
    WordPressSettings {
  framework: Framework;
  useOldPluginVersion2025: boolean;
  responsiveRoot: boolean;
}
// Messaging
export interface ConversionData {
  code: string;
  settings: PluginSettings;
  htmlPreview: HTMLPreview;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  warnings: Warning[];
}

export type Warning = string;
export type Warnings = Set<Warning>;

export interface Message {
  type: string;
}
export interface UIMessage {
  pluginMessage: Message;
}
export type EmptyMessage = Message & { type: "empty" };
export type ConversionStartMessage = Message & { type: "conversionStarted" };
export type ConversionMessage = Message & {
  type: "code";
} & ConversionData;
export type SettingWillChangeMessage<T> = Message & {
  type: "pluginSettingWillChange";
  key: string;
  value: T;
};
export type SettingsChangedMessage = Message & {
  type: "pluginSettingsChanged";
  settings: PluginSettings;
};
export type ErrorMessage = Message & {
  type: "error";
  error: string;
};
// One shared download-message family for every framework's zip download,
// WordPress included. Previously WordPress had its own separate
// download-wordpress/wordpress-zip/wordpress-download-error trio running
// in parallel with this one -- merged so WordPress is just another
// DownloadFormat value flowing through the same three message types
// every other framework already used, rather than a structurally
// distinct protocol bolted on beside it.
export type DownloadFormat =
  | "flutter"
  | "html"
  | "nextjs"
  | "swiftui"
  | "vite"
  // WordPress's two output modes (see WordPressOutputMode) -- folded
  // into this union instead of carried as a separate `outputMode` field
  // on a WordPress-only message.
  | "wordpress-theme"
  | "wordpress-design-bundle";
export type DownloadMessage = Message & {
  type: "download";
  format: DownloadFormat;
};
// WP Theme summary (see XC32)
export interface WordPressGenerationSummary {
  designCount: number;
  assetCount: number;
  patternCount: number;
  resolvedFontFamilies: string[];
  unresolvedFontFamilies: string[];
}
export type DownloadZipMessage = Message & {
  type: "zip";
  zip: ArrayBuffer;
  format: DownloadFormat;
  fileName: string;
  // Only ever populated for the two wordpress-* formats -- the five code
  // targets have no generation-warnings or summary concept. `undefined`
  // for those, not an empty array/object, so a consumer can tell "no
  // summary exists for this format" apart from "this run had nothing to
  // report."
  warnings?: Warning[];
  summary?: WordPressGenerationSummary;
};
export type DownloadErrorMessage = Message & {
  type: "download-error";
  error: string;
};

// Nodes
export type ParentNode = BaseNode & ChildrenMixin;

export type AltNodeMetadata<T extends BaseNode> = {
  originalNode: T;
  canBeFlattened: boolean;
  svg?: string;
  base64?: string;
};
export type AltNode<T extends BaseNode> = T & AltNodeMetadata<T>;

export type ExportableNode = SceneNode & ExportMixin & MinimalFillsMixin;

// Styles & Conversions

export type LayoutMode =
  | ""
  | "Absolute"
  | "TopStart"
  | "TopCenter"
  | "TopEnd"
  | "CenterStart"
  | "Center"
  | "CenterEnd"
  | "BottomStart"
  | "BottomCenter"
  | "BottomEnd";

export interface BoundingRect {
  x: number;
  y: number;
}

interface AllSides {
  all: number;
}
interface Sides {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
interface Corners {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}
interface HorizontalAndVertical {
  horizontal: number;
  vertical: number;
}

export type PaddingType = Sides | AllSides | HorizontalAndVertical;
export type BorderSide = AllSides | Sides;
export type CornerRadius = AllSides | Corners;

export type SizeValue = number | "fill" | null;
export interface Size {
  readonly width: SizeValue;
  readonly height: SizeValue;
}

export type StyledTextSegmentSubset = Omit<
  StyledTextSegment,
  "listSpacing" | "paragraphIndent" | "paragraphSpacing" | "textStyleOverrides"
>;

export type FontWeightNumber =
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export type ColorSpec = {
  source: string;
  rgb: RGB;
};

export type SolidColorConversion = {
  hex: string;
  colorName: string;
  exportValue: string;
  contrastWhite: number;
  contrastBlack: number;
  meta?: string;
};
export type LinearGradientConversion = {
  cssPreview: string;
  exportValue: string;
};

// Framework Specific

export interface HTMLPreview {
  size: { width: number; height: number };
  content: string;
}

export interface TailwindTextConversion {
  name: string;
  attr: string;
  full: string;
  style: string;
  contrastBlack: number;
}

export type TailwindColorType = "text" | "bg" | "border" | "outline";

export type SwiftUIModifier = [
  string,
  string | SwiftUIModifier | SwiftUIModifier[],
];

// UI

export interface PreferenceOptions {
  itemType: string;
  label: string;
  propertyName: string;
  includedLanguages?: Framework[];
}
export interface SelectPreferenceOptions extends PreferenceOptions {
  itemType: "select";
  propertyName: Exclude<keyof PluginSettings, "framework">;
  options: { label: string; value: string; isDefault?: boolean }[];
}

export interface LocalCodegenPreferenceOptions extends PreferenceOptions {
  itemType: "individual_select";
  propertyName: Exclude<
    keyof PluginSettings,
    "framework" | "flutterGenerationMode" | "swiftUIGenerationMode"
  >;
  description: string;
  value?: boolean;
  isDefault?: boolean;
}

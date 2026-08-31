import "@figma/plugin-typings";
// Settings
export type Framework =
  | "Flutter"
  | "SwiftUI"
  | "HTML"
  | "Tailwind"
  | "Compose"
  // Phase 9 (Figma -> WordPress pipeline, see AvetosDesign's
  // theme-creator-for-figma repo): a target peer to the code-generation
  // frameworks above, not a code-generation language itself -- selecting
  // it doesn't show generated code (see PluginSettings.wpOutputMode/
  // WordPressSettings below and CodePanel's WordPress-specific branch).
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
 * Phase 9 UI spec (D115): the WordPress tab's own two settings -- which of
 * its two outputs is selected ("WP Theme" vs. "Design Bundle", the
 * two-option button-group under "WordPress Options"), and the "Include
 * Fonts" checkbox under "Download Options" (D115: defaulted checked,
 * governs a Google Fonts network call at generation time). Neither output
 * is wired to real generation yet -- see CodePanel's WordPress branch and
 * D118 in the decisions log.
 */
export type WordPressOutputMode = "theme" | "designBundle";
export interface WordPressSettings {
  wpOutputMode: WordPressOutputMode;
  wpIncludeFonts: boolean;
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
export type DownloadProjectFormat =
  | "flutter"
  | "html"
  | "nextjs"
  | "swiftui"
  | "vite";
export type DownloadProjectMessage = Message & {
  type: "download-project";
  format: DownloadProjectFormat;
};
export type ProjectZipMessage = Message & {
  type: "project-zip";
  zip: ArrayBuffer;
  format: DownloadProjectFormat;
  fileName: string;
};
export type ProjectDownloadErrorMessage = Message & {
  type: "project-download-error";
  error: string;
};

/**
 * Phase 9 (D122 follow-up, stage 2 of 2 part 2): the WordPress tab's own
 * "WP Theme" download flow -- parallel to DownloadProjectMessage/
 * ProjectZipMessage/ProjectDownloadErrorMessage above but kept as its own
 * message trio rather than reusing those, since a WordPress output isn't
 * a DownloadProjectFormat (it's produced by wp-figma-gen's ported
 * generation logic -- see backend's generateWordPressTheme.ts -- not any
 * of the code-gen frameworks' own zip templates in zipGenerator.ts).
 * "Design Bundle" isn't included here: it stays disabled (D118/D122's
 * roadmap note) until its own generation path is built.
 */
export type WordPressDownloadMessage = Message & {
  type: "download-wordpress";
  outputMode: WordPressOutputMode;
};
/** Counts summarizing what a WP Theme download produced, for the WordPress tab's feedback panel -- the closest equivalent it has to the other tabs' code preview. */
export interface WordPressGenerationSummary {
  designCount: number;
  assetCount: number;
  patternCount: number;
  resolvedFontFamilies: string[];
  unresolvedFontFamilies: string[];
}
export type WordPressZipMessage = Message & {
  type: "wordpress-zip";
  zip: ArrayBuffer;
  outputMode: WordPressOutputMode;
  fileName: string;
  warnings: Warning[];
  summary: WordPressGenerationSummary;
};
export type WordPressDownloadErrorMessage = Message & {
  type: "wordpress-download-error";
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

import { DesignBundle, DesignBundleAsset, DesignBundleStyles, PluginSettings } from "types";
import { nodesToJSON } from "../altNodes/jsonNodeConversion";
import { addWarning, clearWarnings, warnings } from "../common/commonConversionWarnings";
import { buildDesignNode, resetDesignBundleTreeState } from "./designBundleTree";
import { collectTextStyleIds, resolveTextStyles } from "./designBundleTextStyles";
import { exportDesignBundleAssets } from "./designBundleAssets";
import { generateDesignBundleZip } from "./designBundleZip";

export const DESIGN_BUNDLE_SOURCE_TOOL = "FigmaToCode-fork/design-bundle@0.1.0";

const toKebab = (value: string) =>
  (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export interface DesignBundleExportResult {
  zip: Uint8Array;
  fileName: string;
  designCount: number;
  assetCount: number;
  warnings: string[];
}

/**
 * Stage 1 (Phase 2) entry point: turns the current Figma selection into a
 * Design Bundle zip (design-bundle.json + /assets), per
 * docs/03-design-bundle-schema-draft.md.
 *
 * Reuses `nodesToJSON` for the actual node-tree normalization (Auto Layout,
 * variables, styled text segments, empty-frame flattening, GROUP inlining —
 * all already handled there and already multi-selection-safe, see D10 note
 * in the decisions log) rather than re-deriving any of that. This module's
 * only job is mapping that AltNode-shaped output onto the bundle's
 * `DesignNode` shape and wiring up the explicit asset export step D9 calls
 * for.
 */
export const buildDesignBundle = async (
  selection: readonly SceneNode[],
  settings: PluginSettings,
): Promise<DesignBundleExportResult> => {
  if (selection.length === 0) {
    throw new Error("Please select at least one layer to export.");
  }

  clearWarnings();
  resetDesignBundleTreeState();

  const convertedSelection = await nodesToJSON(selection, settings);

  if (convertedSelection.length !== selection.length) {
    // nodesToJSON can return more entries than the input selection when a
    // top-level GROUP gets inlined into multiple sibling nodes (see
    // jsonNodeConversion.ts). D10 assumed a clean 1:1 mapping between
    // selected layers and designs[] entries; a top-level GROUP breaks that
    // assumption. Logged as a real Phase 2 finding (see decisions log D18)
    // rather than silently mismatching names below.
    console.warn(
      "[design-bundle] convertedSelection count does not match selection count " +
        "(likely a top-level GROUP was inlined) — falling back to converted node names.",
    );
  }

  const assets: DesignBundleAsset[] = [];
  const styles: DesignBundleStyles = { colors: {}, textStyles: {} };

  const designs = convertedSelection.map((node: any, index: number) => {
    const originalNode = selection[index];
    const root = buildDesignNode(node, assets, styles, undefined);
    return {
      figmaNodeId: root.id,
      // Raw, as-authored Figma layer name only — no slug/title (D15).
      // Falls back to the converted node's own name if the index-aligned
      // original selection entry is unavailable (see mismatch note above).
      layerName: originalNode?.name ?? node.name ?? root.uniqueName,
      root,
    };
  });

  // Named-text-style resolution (D23): a separate async pass after tree-
  // building, since Figma's style lookup (getStyleByIdAsync) is async and
  // buildDesignNode itself is kept synchronous (see designBundleTextStyles.ts).
  const textStyleIds = new Set<string>();
  for (const design of designs) {
    collectTextStyleIds(design.root, textStyleIds);
  }
  const textStyleWarnings = await resolveTextStyles(textStyleIds, styles.textStyles);
  // Routed through addWarning (not a bare console.warn) so these actually
  // reach the plugin UI's WarningsPanel — see D19, where warnings silently
  // not reaching the UI was itself a real bug, not just a missing feature.
  for (const w of textStyleWarnings) addWarning(w);

  const exportedAssets = await exportDesignBundleAssets(assets);

  const bundle: DesignBundle = {
    schemaVersion: 1,
    meta: {
      figmaFileKey: figma.fileKey ?? "",
      figmaFileName: figma.root.name,
      figmaPageName: figma.currentPage.name,
      exportedAt: new Date().toISOString(),
      exportedBy: DESIGN_BUNDLE_SOURCE_TOOL,
      sourceTool: "FigmaToCode-fork",
    },
    designs,
    assets,
    styles,
  };

  const zip = generateDesignBundleZip(bundle, exportedAssets);
  const rootLabel =
    designs.length === 1
      ? toKebab(designs[0].layerName)
      : toKebab(figma.currentPage.name) || "design-bundle";
  const fileName = `${rootLabel || "design-bundle"}-design-bundle.zip`;

  return {
    zip,
    fileName,
    designCount: designs.length,
    assetCount: assets.length,
    warnings: [...warnings],
  };
};

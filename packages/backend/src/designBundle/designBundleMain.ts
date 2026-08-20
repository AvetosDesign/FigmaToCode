import { DesignBundle, DesignBundleAsset, DesignBundleStyles, DesignNode, PluginSettings } from "types";
import { nodesToJSON } from "../altNodes/jsonNodeConversion";
import { addWarning, clearWarnings, warnings } from "../common/commonConversionWarnings";
import { buildDesignNode, resetDesignBundleTreeState } from "./designBundleTree";
import { collectTextStyleIds, resolveTextStyles } from "./designBundleTextStyles";
import { exportDesignBundleAssets } from "./designBundleAssets";
import { generateDesignBundleZip } from "./designBundleZip";

// Clears assetRef/backgroundAssetRef on any node pointing at an asset that
// failed to export (see exportDesignBundleAssets' failedAssetIds) — run
// after filtering those ids out of the manifest's assets[] so a design's
// nodes never reference an asset id that no longer appears anywhere in the
// bundle (the whole point of the failedAssetIds plumbing; filtering
// assets[] alone would just move the dangling reference from assets[] to
// designs[].root...children[]).
const clearFailedAssetRefs = (node: DesignNode, failedAssetIds: Set<string>) => {
  if (node.assetRef && failedAssetIds.has(node.assetRef)) {
    delete node.assetRef;
  }
  if (node.backgroundAssetRef && failedAssetIds.has(node.backgroundAssetRef)) {
    delete node.backgroundAssetRef;
  }
  for (const child of node.children ?? []) {
    clearFailedAssetRefs(child, failedAssetIds);
  }
};

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
 * Entry point: turns the current Figma selection into a Design Bundle zip
 * (design-bundle.json + /assets).
 *
 * Reuses `nodesToJSON` for the actual node-tree normalization (Auto Layout,
 * variables, styled text segments, empty-frame flattening, GROUP inlining —
 * all already handled there and already multi-selection-safe) rather than
 * re-deriving any of that. This module's only job is mapping that
 * AltNode-shaped output onto the bundle's `DesignNode` shape and wiring up
 * the explicit asset-export step (exportDesignBundleAssets, below).
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
    // jsonNodeConversion.ts) — a top-level GROUP breaks the otherwise
    // clean 1:1 mapping between selected layers and designs[] entries.
    // Matched by node id below (rather than array index) so this doesn't
    // silently pair a converted entry with the wrong original selection
    // layer once the two arrays are out of step.
    console.warn(
      "[design-bundle] convertedSelection count does not match selection count " +
        "(likely a top-level GROUP was inlined) — matching by node id instead of index.",
    );
  }

  // Keyed by id so a converted entry is only ever paired with the
  // selected layer it actually came from — an index-based lookup
  // (`selection[index]`) silently drifts out of alignment as soon as one
  // top-level GROUP expands into multiple entries, pairing every
  // subsequent design with the wrong original layer's name instead of
  // just failing to find one.
  const selectionById = new Map(selection.map((s) => [s.id, s]));

  const assets: DesignBundleAsset[] = [];
  const styles: DesignBundleStyles = { colors: {}, textStyles: {} };

  const designs = convertedSelection.map((node: any) => {
    const root = buildDesignNode(node, assets, styles, undefined);
    const originalNode = selectionById.get(root.id);
    return {
      figmaNodeId: root.id,
      // Raw, as-authored Figma layer name only — no slug/title.
      // Falls back to the converted node's own name when no original
      // selection entry shares this id (e.g. this design came from an
      // inlined GROUP's child, which was never itself a top-level
      // selection entry — see mismatch note above).
      layerName: originalNode?.name ?? node.name ?? root.uniqueName,
      root,
    };
  });

  // Named-text-style resolution: a separate async pass after tree-building,
  // since Figma's style lookup (getStyleByIdAsync) is async and
  // buildDesignNode itself is kept synchronous (see designBundleTextStyles.ts).
  const textStyleIds = new Set<string>();
  for (const design of designs) {
    collectTextStyleIds(design.root, textStyleIds);
  }
  const textStyleWarnings = await resolveTextStyles(textStyleIds, styles.textStyles);
  // Routed through addWarning (not a bare console.warn) so these actually
  // reach the plugin UI's WarningsPanel — a bare console.warn here would
  // never surface these to the user.
  for (const w of textStyleWarnings) addWarning(w);

  const { exported: exportedAssets, failedAssetIds } = await exportDesignBundleAssets(assets);

  // Drop any asset that failed to export from the manifest — otherwise
  // design-bundle.json lists an asset with no corresponding file in the
  // zip's /assets (exportDesignBundleAssets already logged a warning for
  // each one via addWarning). Also clear any assetRef/backgroundAssetRef
  // in the design tree that pointed at one of these, so nothing in the
  // manifest references a dropped id.
  const failedAssetIdSet = new Set(failedAssetIds);
  const finalAssets =
    failedAssetIdSet.size > 0
      ? assets.filter((asset) => !failedAssetIdSet.has(asset.id))
      : assets;
  if (failedAssetIdSet.size > 0) {
    for (const design of designs) {
      clearFailedAssetRefs(design.root, failedAssetIdSet);
    }
  }

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
    assets: finalAssets,
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
    assetCount: finalAssets.length,
    warnings: [...warnings],
  };
};

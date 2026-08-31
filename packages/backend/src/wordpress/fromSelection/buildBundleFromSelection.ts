/**
 * Phase 9 (F2C port, stage 2). Adapted from git history (commit `7ce9238`,
 * packages/backend/src/designBundle/designBundleMain.ts's `buildDesignBundle`)
 * -- see designBundleTree.ts's doc comment for the full context on why
 * this is being restored rather than written fresh.
 *
 * Two real differences from the original, beyond the import-source change
 * every restored file in this directory needs (`../core/types/
 * designBundle` instead of the public `"types"` package):
 *  - No zip step. The original built a standalone `design-bundle.json` +
 *    `/assets` zip for its own download button (D119 removed that button
 *    and its zip-building code, `designBundleZip.ts`, entirely -- not
 *    restored here). This function's only job now is producing the
 *    `DesignBundle` object and an `assets: Record<string, Uint8Array>`
 *    map in exactly the shape `generateThemeFiles`/`generatePatternFiles`
 *    (D121's port) already take as their own `assets` parameter --
 *    whatever wires the actual WordPress download button calls both in
 *    sequence, with no bundle-shaped zip in between.
 *  - `DESIGN_BUNDLE_SOURCE_TOOL`'s value was renamed from the old
 *    button's own branding string to reflect that this bundle is now
 *    purely an internal intermediate value for WordPress generation, not
 *    a user-facing exported artifact.
 */
import type { DesignBundle, DesignBundleAsset, DesignBundleStyles, DesignNode } from "../core/types/designBundle";
import type { PluginSettings } from "types";
import { nodesToJSON } from "../../altNodes/jsonNodeConversion";
import { addWarning, clearWarnings, warnings } from "../../common/commonConversionWarnings";
import { buildDesignNode, resetDesignBundleTreeState } from "./designBundleTree";
import { collectTextStyleIds, resolveTextStyles } from "./designBundleTextStyles";
import { exportDesignBundleAssets } from "./designBundleAssets";

// Clears assetRef/backgroundAssetRef on any node pointing at an asset that
// failed to export (see exportDesignBundleAssets' failedAssetIds) — run
// after filtering those ids out of the manifest's assets[] so the bundle
// never references an asset id that no longer appears anywhere in
// `assets` (the whole point of the failedAssetIds plumbing; filtering
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

export const DESIGN_BUNDLE_SOURCE_TOOL = "FigmaToCode-fork/wordpress-generation@0.1.0";

export interface BuildBundleFromSelectionResult {
  bundle: DesignBundle;
  /** Keyed by `DesignBundleAsset.fileName`, ready to hand straight to `generateThemeFiles`/`generatePatternFiles`'s own `assets` parameter. */
  assets: Record<string, Uint8Array>;
  warnings: string[];
}

/**
 * Entry point: turns the current Figma selection into a `DesignBundle`
 * object plus its exported asset bytes, ready for `generateThemeFiles`/
 * `generatePatternFiles` (D121's port) to consume.
 *
 * Reuses `nodesToJSON` for the actual node-tree normalization (Auto Layout,
 * variables, styled text segments, empty-frame flattening, GROUP inlining —
 * all already handled there and already multi-selection-safe) rather than
 * re-deriving any of that. This module's only job is mapping that
 * AltNode-shaped output onto the bundle's `DesignNode` shape and wiring up
 * the explicit asset-export step (exportDesignBundleAssets).
 */
export const buildBundleFromSelection = async (
  selection: readonly SceneNode[],
  settings: PluginSettings,
): Promise<BuildBundleFromSelectionResult> => {
  if (selection.length === 0) {
    throw new Error("Please select at least one layer to generate a WordPress theme from.");
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
      "[wp-bundle] convertedSelection count does not match selection count " +
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
  // the bundle lists an asset with no corresponding entry in `assets`
  // (exportDesignBundleAssets already logged a warning for each one via
  // addWarning). Also clear any assetRef/backgroundAssetRef in the design
  // tree that pointed at one of these, so nothing in the manifest
  // references a dropped id.
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

  const assetsByFileName: Record<string, Uint8Array> = Object.fromEntries(
    exportedAssets.map((asset) => [asset.fileName, asset.bytes]),
  );

  return {
    bundle,
    assets: assetsByFileName,
    warnings: [...warnings],
  };
};

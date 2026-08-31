/**
 * Phase 9 (F2C port, stage 2). Restored from git history (commit
 * `7ce9238`, packages/backend/src/designBundle/designBundleAssets.ts) --
 * see designBundleTree.ts's doc comment for the full context on why this
 * is being restored rather than written fresh. Two changes from the
 * original: `DesignBundleAsset` now comes from this fork's internal
 * `../core/types/designBundle` instead of the public `"types"` package,
 * and UTF-8 encoding goes through D121's `core/textEncoding.ts`'s
 * `encodeText` instead of the original's own local `designBundleUtils.ts`
 * (dropped -- redundant with textEncoding.ts's own TextEncoder-or-
 * fallback helper, already ported for the generation code this feeds).
 */
import type { DesignBundleAsset } from "../core/types/designBundle";
import { addWarning } from "../../common/commonConversionWarnings";
import { encodeText } from "../core/textEncoding";

export interface ExportedDesignBundleAsset {
  fileName: string;
  bytes: Uint8Array;
}

export interface DesignBundleAssetExportResult {
  exported: ExportedDesignBundleAsset[];
  // Ids (DesignBundleAsset.id) of assets that failed to export — a missing
  // node, a getImageByHash miss, or a thrown exportAsync/getBytesAsync call.
  // The caller (buildBundleFromSelection.ts) uses this to drop the asset
  // from the manifest's `assets[]` (and any DesignNode.assetRef/
  // backgroundAssetRef pointing at it) so the bundle never references a
  // file that doesn't actually exist among `exported` — previously a
  // failed export was only ever logged as a warning, leaving the dangling
  // reference in place.
  failedAssetIds: string[];
}

// Shared with designBundleTree.ts so the manifest's `DesignBundleAsset.scale`
// field always matches the constraint actually passed to `exportAsync`
// below, rather than a second hardcoded "2" drifting out of sync with it.
export const DESIGN_BUNDLE_RASTER_SCALE = 2;

// Caps how many assets are exported concurrently. Fully sequential export
// makes total time grow linearly with selection size for no benefit — each
// `exportAsync`/`getBytesAsync` call is an independent round trip through
// Figma's renderer, not CPU-bound work competing for the same resource, so a
// small in-flight limit shortens wall-clock time on large selections without
// the unbounded memory/scheduling cost of firing every export at once.
const ASSET_EXPORT_CONCURRENCY = 4;

/**
 * Explicit Images-API asset export. FigmaToCode's default codegen path
 * leaves image `src` as placehold.co placeholders and never calls
 * `exportAsync` for plain layout/text output — WordPress theme generation
 * needs real files regardless, so this is a standalone step over the asset
 * manifest `buildDesignNode` already collected, not a reuse of any HTML/
 * Tailwind/etc. image handling.
 *
 * Raster (IMAGE) nodes export as PNG at 2x. Vector
 * (VECTOR/STAR/POLYGON/BOOLEAN_OPERATION/LINE) nodes export as SVG so a
 * downstream consumer can inline them directly instead of rasterizing.
 * Exports run with bounded concurrency (see ASSET_EXPORT_CONCURRENCY) rather
 * than one at a time.
 */
export const exportDesignBundleAssets = async (
  assets: DesignBundleAsset[],
): Promise<DesignBundleAssetExportResult> => {
  const exported: ExportedDesignBundleAsset[] = [];
  const failedAssetIds: string[] = [];

  const exportOne = async (asset: DesignBundleAsset): Promise<void> => {
    // A background-image asset (DesignNode.backgroundAssetRef, not
    // assetRef) carries `imageHash` instead — resolved via
    // `figma.getImageByHash`, not `node.exportAsync()`. The containing
    // node also has real child content painted on top of this fill (the
    // whole reason it's a background-image asset rather than a normal
    // leaf IMAGE asset — see designBundleTree.ts's matching comment on
    // `backgroundAssetRef`), so exporting *that node* would flatten the
    // children into the raster too. `getImageByHash` resolves the fill's
    // own raw bytes directly, independent of anything else the node
    // renders. Figma's REST API v1 calls this same value `imageRef`; the
    // Plugin API's `getImageByHash` accepts it under the name `hash` —
    // same underlying image reference.
    if (asset.imageHash) {
      try {
        const image = figma.getImageByHash(asset.imageHash);
        if (!image) {
          addWarning(
            `Could not export background-image asset (${asset.fileName}) — image hash ${asset.imageHash} not found.`,
          );
          failedAssetIds.push(asset.id);
          return;
        }
        const bytes = await image.getBytesAsync();
        exported.push({ fileName: asset.fileName, bytes });
      } catch (error) {
        addWarning(
          `Failed exporting background-image asset ${asset.fileName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        failedAssetIds.push(asset.id);
      }
      return;
    }

    const figmaNode = (await figma.getNodeByIdAsync(
      asset.figmaNodeId,
    )) as (SceneNode & ExportMixin) | null;

    if (!figmaNode || !("exportAsync" in figmaNode)) {
      addWarning(
        `Could not export asset for node ${asset.figmaNodeId} (${asset.fileName}) — node missing or not exportable.`,
      );
      failedAssetIds.push(asset.id);
      return;
    }

    try {
      if (asset.kind === "vector") {
        const svg = await figmaNode.exportAsync({ format: "SVG_STRING" });
        exported.push({
          fileName: asset.fileName,
          bytes: encodeText(svg),
        });
      } else {
        const bytes = await figmaNode.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: DESIGN_BUNDLE_RASTER_SCALE },
        });
        exported.push({ fileName: asset.fileName, bytes });
      }
    } catch (error) {
      addWarning(
        `Failed exporting asset ${asset.fileName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      failedAssetIds.push(asset.id);
    }
  };

  // Simple bounded worker pool: each of up to ASSET_EXPORT_CONCURRENCY
  // workers pulls the next asset off a shared cursor and exports it, so at
  // most that many exports are ever in flight at once. `exported`/
  // `failedAssetIds` are mutated by `exportOne` directly rather than
  // collected per-worker, since downstream consumption
  // (buildBundleFromSelection.ts) keys off `fileName`/`asset.id`, not array
  // order.
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < assets.length) {
      const asset = assets[nextIndex];
      nextIndex += 1;
      await exportOne(asset);
    }
  };
  const workerCount = Math.min(ASSET_EXPORT_CONCURRENCY, assets.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { exported, failedAssetIds };
};

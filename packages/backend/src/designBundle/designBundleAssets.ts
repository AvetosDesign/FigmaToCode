import { DesignBundleAsset } from "types";
import { addWarning } from "../common/commonConversionWarnings";
import { encodeUtf8Text } from "./designBundleUtils";

export interface ExportedDesignBundleAsset {
  fileName: string;
  bytes: Uint8Array;
}

/**
 * Explicit Images-API asset export. FigmaToCode's default codegen path
 * leaves image `src` as placehold.co placeholders and never calls
 * `exportAsync` for plain layout/text output — the Design Bundle needs real
 * files regardless of which codegen path (if any) is otherwise in use, so
 * this is a standalone step over the asset manifest `buildDesignNode`
 * already collected, not a reuse of any HTML/Tailwind/etc. image handling.
 *
 * Raster (IMAGE) nodes export as PNG at 2x. Vector
 * (VECTOR/STAR/POLYGON/BOOLEAN_OPERATION/LINE) nodes export as SVG so a
 * downstream consumer can inline them directly instead of rasterizing.
 */
export const exportDesignBundleAssets = async (
  assets: DesignBundleAsset[],
): Promise<ExportedDesignBundleAsset[]> => {
  const exported: ExportedDesignBundleAsset[] = [];

  for (const asset of assets) {
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
          continue;
        }
        const bytes = await image.getBytesAsync();
        exported.push({ fileName: asset.fileName, bytes });
      } catch (error) {
        addWarning(
          `Failed exporting background-image asset ${asset.fileName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      continue;
    }

    const figmaNode = (await figma.getNodeByIdAsync(
      asset.figmaNodeId,
    )) as (SceneNode & ExportMixin) | null;

    if (!figmaNode || !("exportAsync" in figmaNode)) {
      addWarning(
        `Could not export asset for node ${asset.figmaNodeId} (${asset.fileName}) — node missing or not exportable.`,
      );
      continue;
    }

    try {
      if (asset.kind === "vector") {
        const svg = await figmaNode.exportAsync({ format: "SVG_STRING" });
        exported.push({
          fileName: asset.fileName,
          bytes: encodeUtf8Text(svg),
        });
      } else {
        const bytes = await figmaNode.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 2 },
        });
        exported.push({ fileName: asset.fileName, bytes });
      }
    } catch (error) {
      addWarning(
        `Failed exporting asset ${asset.fileName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return exported;
};

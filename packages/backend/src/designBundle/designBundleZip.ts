import { zipSync } from "fflate";
import { DesignBundle } from "types";
import { ExportedDesignBundleAsset } from "./designBundleAssets";
import { encodeUtf8Text as encodeText } from "./designBundleUtils";

/**
 * Packages a Design Bundle as a zip: `design-bundle.json` at the root plus
 * an `assets/` folder containing every exported raster/vector asset,
 * referenced from the manifest by relative path.
 */
export const generateDesignBundleZip = (
  bundle: DesignBundle,
  assets: ExportedDesignBundleAsset[],
): Uint8Array => {
  const files: Record<string, Uint8Array> = {
    "design-bundle.json": encodeText(JSON.stringify(bundle, null, 2)),
  };

  for (const asset of assets) {
    files[asset.fileName] = asset.bytes;
  }

  try {
    return zipSync(files, { level: 6 });
  } catch (error) {
    console.error("Design bundle zip creation failed:", error);
    throw new Error(
      "Failed to create design bundle archive. The selection might be too large or complex.",
    );
  }
};

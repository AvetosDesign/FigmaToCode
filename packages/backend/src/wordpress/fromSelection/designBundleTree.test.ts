import { beforeEach, describe, expect, it } from "vitest";
import {
  buildDesignNode,
  ConvertedNode,
  resetDesignBundleTreeState,
} from "./designBundleTree";
import { DesignBundleAsset, DesignBundleStyles } from "../core/types/designBundle";

/**
 * Regression coverage for the asset-identity dedup gap found post-D137
 * (04-roadmap.md's "Open item, found during D137's post-push sanity
 * check" entry, closed by this fix): `assetIdentityKeyFor` used to return
 * `undefined` for any node id without Figma's `I{instanceId};{masterChildId}`
 * shape, so a component's own master-definition node (a bare id, since
 * it isn't seen "through" an Instance) never matched the same key an
 * Instance descendant of that component resolves to, and got re-exported
 * as an independent, unreferenced duplicate asset. Confirmed against a
 * real bundle: a footer Instance's icon (`I2011:121;1:1468`) and that
 * same footer's master-Component-definition icon (bare id `1:1468`, the
 * same masterChildId) produced two separate byte-identical assets instead
 * of one.
 *
 * `buildDesignNode` has no live Figma API calls (see the file's own doc
 * comment), so it's exercised directly here with synthetic fixtures
 * rather than a real Figma session -- same approach D63's original
 * Instance-to-Instance dedup was verified with.
 */

const noStyles: DesignBundleStyles = { colors: {}, textStyles: {} };

const vectorNode = (id: string, uniqueName = "Icon"): ConvertedNode => ({
  id,
  type: "VECTOR",
  uniqueName,
  width: 20,
  height: 20,
});

const frameWithImageFill = (id: string, imageRef: string): ConvertedNode => ({
  id,
  type: "FRAME",
  uniqueName: "Hero",
  width: 100,
  height: 100,
  fills: [{ type: "IMAGE", imageRef, visible: true }],
  // A real child keeps classifyNodeType from collapsing this to a leaf
  // IMAGE node -- see designBundleTree.ts's own comment on that branch.
  children: [{ id: `${id}_child`, type: "TEXT", uniqueName: "Heading" }],
});

beforeEach(() => {
  resetDesignBundleTreeState();
});

describe("buildDesignNode -- asset identity dedup (leaf IMAGE/VECTOR)", () => {
  it("dedupes an Instance descendant against its master-Component-definition node (instance seen first)", () => {
    const assets: DesignBundleAsset[] = [];
    const instanceIcon = buildDesignNode(
      vectorNode("I2011:121;1:1468"),
      assets,
      noStyles,
      undefined,
    );
    const masterDefinitionIcon = buildDesignNode(
      vectorNode("1:1468"),
      assets,
      noStyles,
      undefined,
    );

    expect(assets).toHaveLength(1);
    expect(masterDefinitionIcon.assetRef).toBe(instanceIcon.assetRef);
  });

  it("dedupes the same pair with the master-Component-definition node seen first -- order-independent", () => {
    const assets: DesignBundleAsset[] = [];
    const masterDefinitionIcon = buildDesignNode(
      vectorNode("1:1468"),
      assets,
      noStyles,
      undefined,
    );
    const instanceIcon = buildDesignNode(
      vectorNode("I2011:121;1:1468"),
      assets,
      noStyles,
      undefined,
    );

    expect(assets).toHaveLength(1);
    expect(instanceIcon.assetRef).toBe(masterDefinitionIcon.assetRef);
  });

  it("still exports separately for genuinely unrelated nodes (no shared masterChildId)", () => {
    const assets: DesignBundleAsset[] = [];
    const iconOne = buildDesignNode(
      vectorNode("1:1468"),
      assets,
      noStyles,
      undefined,
    );
    const iconTwo = buildDesignNode(
      vectorNode("1:9999"),
      assets,
      noStyles,
      undefined,
    );

    expect(assets).toHaveLength(2);
    expect(iconTwo.assetRef).not.toBe(iconOne.assetRef);
  });

  it("still dedupes two Instance descendants of the same component (D63's original case, unaffected)", () => {
    const assets: DesignBundleAsset[] = [];
    const firstInstanceIcon = buildDesignNode(
      vectorNode("I2011:121;1:1468"),
      assets,
      noStyles,
      undefined,
    );
    const secondInstanceIcon = buildDesignNode(
      vectorNode("I2011:161;1:1468"),
      assets,
      noStyles,
      undefined,
    );

    expect(assets).toHaveLength(1);
    expect(secondInstanceIcon.assetRef).toBe(firstInstanceIcon.assetRef);
  });
});

describe("buildDesignNode -- asset identity dedup (background image fill)", () => {
  it("dedupes an Instance descendant's background fill against its master-Component-definition node", () => {
    const assets: DesignBundleAsset[] = [];
    const instanceHero = buildDesignNode(
      frameWithImageFill("I2011:121;1:1500", "hash-abc"),
      assets,
      noStyles,
      undefined,
    );
    const masterDefinitionHero = buildDesignNode(
      frameWithImageFill("1:1500", "hash-abc"),
      assets,
      noStyles,
      undefined,
    );

    expect(assets).toHaveLength(1);
    expect(masterDefinitionHero.backgroundAssetRef).toBe(
      instanceHero.backgroundAssetRef,
    );
  });
});

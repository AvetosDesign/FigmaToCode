import { describe, expect, it } from "vitest";
import { generatePatternFiles } from "./generatePatternFiles.ts";
import { createInMemorySink } from "../core/outputSink.ts";
import type { DesignBundle } from "../core/types/designBundle.ts";

// F2C port: see theme/generateThemeFiles.test.ts's own doc comment for why
// this fork drops the CLI original's disk-vs-memory parity test (no disk
// sink exists here to compare against) in favor of an in-memory-only
// functional test.

const emptyRoot = {
  id: "root",
  uniqueName: "Root",
  type: "FRAME" as const,
  layout: {
    mode: "NONE" as const,
    primaryAxisAlign: "MIN" as const,
    counterAxisAlign: "MIN" as const,
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    sizing: { width: "hug" as const, height: "hug" as const },
  },
  style: { fills: [], strokes: [], cornerRadius: 0, effects: [] },
  children: [],
};

const bundleWithImage = (): DesignBundle => ({
  schemaVersion: 1,
  meta: {
    figmaFileKey: "key",
    figmaFileName: "Test File",
    figmaPageName: "Page 1",
    exportedAt: "2026-01-01T00:00:00.000Z",
    exportedBy: "tester",
    sourceTool: "FigmaToCode",
  },
  designs: [
    {
      figmaNodeId: "1:1",
      layerName: "Home",
      root: {
        ...emptyRoot,
        children: [
          {
            id: "image-1",
            uniqueName: "Hero",
            type: "IMAGE" as const,
            layout: emptyRoot.layout,
            style: emptyRoot.style,
            assetRef: "asset-1",
            children: [],
          },
        ],
      } as never,
    },
  ],
  assets: [{ id: "asset-1", figmaNodeId: "1:2", fileName: "assets/hero.png", kind: "raster", width: 10, height: 10 }],
  styles: { colors: {}, textStyles: {} },
});

describe("generatePatternFiles -- F2C in-memory generation", () => {
  it("writes one pattern JSON file, the bundled asset, and a shared CSS file", () => {
    const bundle = bundleWithImage();
    const assets = { "assets/hero.png": new Uint8Array([1, 2, 3, 4]) };
    const memSink = createInMemorySink();

    const result = generatePatternFiles(bundle, assets, memSink, "/custom/asset/path");

    expect(result.patternSlugs.length).toBe(1);
    expect(Object.keys(memSink.files)).toContain("assets/hero.png");
    expect(Object.keys(memSink.files)).toContain(result.cssFileName);
  });
});

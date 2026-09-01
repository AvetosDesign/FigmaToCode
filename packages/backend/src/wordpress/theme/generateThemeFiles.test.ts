import { describe, expect, it } from "vitest";
import { generateThemeFiles } from "./generateThemeFiles";
import { createInMemorySink } from "../core/outputSink";
import { DesignBundle } from "../core/types/designBundle";

/**
 * F2C port: the CLI original (`theme-creator-for-figma`) pairs this with a
 * disk-vs-memory parity test proving createInMemorySink and
 * createNodeDiskSink produce byte-identical output -- that's the CLI's
 * own verification for the OutputSink abstraction itself, already proven
 * there. This fork has no disk sink to compare against (see
 * `core/outputSink.ts`'s doc comment), so only the in-memory-specific
 * behavior test below is ported.
 *
 * `downloadFonts: false` and an explicit `cliVersion` are used so the test
 * is deterministic -- no live network call to Google Fonts, and (per this
 * fork's `GenerateThemeOptions.cliVersion` doc comment) `cliVersion` is
 * always required here, never defaulted.
 */

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
  assets: [
    {
      id: "asset-1",
      figmaNodeId: "1:2",
      fileName: "assets/hero.png",
      kind: "raster",
      width: 10,
      height: 10,
    },
  ],
  styles: { colors: {}, textStyles: {} },
});

describe("generateThemeFiles -- F2C in-memory generation", () => {
  it("in-memory sink always produces a fresh {major}.{minor}.0 version -- no 'previous run' to bump against", async () => {
    const bundle = bundleWithImage();
    const memSink = createInMemorySink();
    await generateThemeFiles(bundle, {}, memSink, undefined, {
      downloadFonts: false,
      cliVersion: "2.5.9",
    });
    const styleCss = new TextDecoder().decode(memSink.files["style.css"]);
    expect(styleCss).toMatch(/^Version:\s*2\.5\.0\s*$/m);
  });

  it("writes the expected file set for a bundle with one design and one image asset", async () => {
    const bundle = bundleWithImage();
    const assets = { "assets/hero.png": new Uint8Array([1, 2, 3, 4]) };
    const memSink = createInMemorySink();
    const result = await generateThemeFiles(
      bundle,
      assets,
      memSink,
      undefined,
      {
        downloadFonts: false,
        cliVersion: "1.2.3",
      },
    );

    expect(Object.keys(memSink.files)).toContain("style.css");
    expect(Object.keys(memSink.files)).toContain("theme.json");
    expect(Object.keys(memSink.files)).toContain("functions.php");
    expect(Object.keys(memSink.files)).toContain("assets/hero.png");
    expect(result.patternSlugs.length).toBe(1);
  });
});

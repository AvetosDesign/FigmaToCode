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

const imageNode = (
  id: string,
  componentId: string,
  assetRef: string,
  y: number,
  height: number,
): (typeof emptyRoot)["children"][number] => ({
  id,
  uniqueName: id,
  type: "IMAGE" as const,
  layout: {
    ...emptyRoot.layout,
    sizing: { width: "fill" as const, height },
    position: { x: 0, y },
  },
  style: emptyRoot.style,
  componentId,
  assetRef,
  children: [],
});

/**
 * Two designs, each with exactly two root children: a header and a
 * footer sharing the same componentId across both designs (so
 * classifyTemplateParts's majority vote -- >50% of designs -- picks up
 * both). This is the exact shape that used to defeat footer pruning:
 * pruneTemplatePartChildren removed the header from its local `children`
 * copy first, leaving a length-1 array, and pickBottommostChild returns
 * undefined for length <= 1 -- so the footer was never pruned, and ended
 * up rendered both inside the design's own content pattern *and* as its
 * separate parts/footer.html Template Part.
 */
const bundleWithHeaderAndFooter = (): DesignBundle => {
  const design = (n: number) => ({
    figmaNodeId: `${n}:1`,
    layerName: `Design ${n}`,
    root: {
      ...emptyRoot,
      layout: { ...emptyRoot.layout, sizing: { width: "fill" as const, height: 600 } },
      children: [
        imageNode(`header-${n}`, "HEADER_COMPONENT", "header-asset", 0, 50),
        imageNode(`footer-${n}`, "FOOTER_COMPONENT", "footer-asset", 500, 50),
      ],
    } as never,
  });

  return {
    schemaVersion: 1,
    meta: {
      figmaFileKey: "key",
      figmaFileName: "Test File",
      figmaPageName: "Page 1",
      exportedAt: "2026-01-01T00:00:00.000Z",
      exportedBy: "tester",
      sourceTool: "FigmaToCode",
    },
    designs: [design(1), design(2)],
    assets: [
      {
        id: "header-asset",
        figmaNodeId: "1:2",
        fileName: "assets/header.png",
        kind: "raster",
        width: 10,
        height: 10,
      },
      {
        id: "footer-asset",
        figmaNodeId: "1:3",
        fileName: "assets/footer-marker.png",
        kind: "raster",
        width: 10,
        height: 10,
      },
    ],
    styles: { colors: {}, textStyles: {} },
  };
};

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

  it("prunes the footer out of a design's own content pattern even when the header pruned first leaves one child", async () => {
    const bundle = bundleWithHeaderAndFooter();
    const assets = {
      "assets/header.png": new Uint8Array([1]),
      "assets/footer-marker.png": new Uint8Array([2]),
    };
    const memSink = createInMemorySink();
    const result = await generateThemeFiles(bundle, assets, memSink, undefined, {
      downloadFonts: false,
      cliVersion: "1.0.0",
    });

    // Both header and footer must have been classified as shared
    // Template Parts for this bundle -- otherwise the test isn't
    // exercising the bug at all.
    expect(result.templateParts.header).toBeTruthy();
    expect(result.templateParts.footer).toBeTruthy();
    expect(Object.keys(memSink.files)).toContain("parts/footer.html");

    // The footer's own asset must appear in exactly one pattern file --
    // its dedicated Template Part pattern -- never inside a design's own
    // content pattern too.
    const patternFiles = Object.entries(memSink.files).filter(([path]) =>
      path.startsWith("patterns/"),
    );
    const decoded = patternFiles.map(
      ([path, bytes]) =>
        [path, new TextDecoder().decode(bytes)] as [string, string],
    );

    const filesContainingFooterAsset = decoded.filter(([, content]) =>
      content.includes("footer-marker.png"),
    );
    expect(filesContainingFooterAsset.map(([path]) => path)).toEqual([
      "patterns/footer.php",
    ]);
  });
});

describe("generateThemeFiles -- comment-header injection safety", () => {
  it("escapes */ and newlines from Figma-controlled values before they land in style.css's comment header", async () => {
    const bundle = bundleWithImage();
    bundle.meta.figmaFileName = "Evil */ <?php echo 'pwned'; ?>\nRogue-Header: 1";
    bundle.meta.figmaPageName = "Also */ evil\nInjected: yes";
    const assets = { "assets/hero.png": new Uint8Array([1, 2, 3, 4]) };
    const memSink = createInMemorySink();
    await generateThemeFiles(bundle, assets, memSink, undefined, {
      downloadFonts: false,
      cliVersion: "1.0.0",
      themeName: "Also */ overridden\nRogue: 1",
    });

    const styleCss = new TextDecoder().decode(memSink.files["style.css"]);
    // The header comment must still be exactly one comment: the only
    // "*/" anywhere in style.css (header *and* the real CSS rules that
    // follow it -- style.css is header + font-face block + rules, not
    // just the header) is the header's own real terminator, immediately
    // after its last static line.
    expect(styleCss.match(/\*\//g)?.length).toBe(1);
    expect(styleCss).toContain("Requires PHP: 7.4\n*/\n");
    // None of the interpolated values may have injected a raw newline --
    // sanitizeCommentText collapses them to spaces, so "Rogue-Header:"
    // etc. can still appear as plain words *within* the Theme Name/
    // Description line (that's fine -- it's just text now), but must
    // never start a *new* line of its own, which is what would make it
    // parse as a real, fabricated header field.
    const headerBlock = styleCss.slice(0, styleCss.indexOf("*/"));
    expect(headerBlock).not.toMatch(/\n\s*(Rogue-Header:|Injected:|Rogue:)/);
    // Every non-comment-delimiter line must be one of the real, static
    // header fields -- nothing extra got inserted as its own line.
    const lines = headerBlock.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      expect(line).toMatch(
        /^(\/\*|Theme Name:|Description:|Version:|Requires at least:|Requires PHP:)/,
      );
    }
  });

  it("escapes */ and newlines from a Figma layer name used as a starter-pattern Title", async () => {
    const bundle = bundleWithImage();
    bundle.designs[0].layerName = "Evil */ <?php echo 'pwned'; ?>\nSlug: hijacked";
    const assets = { "assets/hero.png": new Uint8Array([1, 2, 3, 4]) };
    const memSink = createInMemorySink();
    await generateThemeFiles(bundle, assets, memSink, undefined, {
      downloadFonts: false,
      cliVersion: "1.0.0",
    });

    const patternFiles = Object.entries(memSink.files).filter(([path]) =>
      path.startsWith("patterns/"),
    );
    for (const [, bytes] of patternFiles) {
      const content = new TextDecoder().decode(bytes);
      const commentEnd = content.indexOf("*/");
      expect(commentEnd).toBeGreaterThan(-1);
      const commentBlock = content.slice(0, commentEnd);
      expect(commentBlock.match(/\*\//g) ?? []).toHaveLength(0);
      expect(commentBlock).not.toMatch(/\nSlug: hijacked/);
    }
  });
});

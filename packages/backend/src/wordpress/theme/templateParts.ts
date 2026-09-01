import { RawBlockChild, indentStr } from "../blocks/index";
import { Stylesheet, addRule } from "../core/style/stylesheet";
import { TemplatePartArea } from "../core/classify/chromeDetect";

/**
 * WordPress consumption of the target-neutral header/footer classification
 * in `core/classify/chromeDetect.ts` — which componentId won the
 * header/footer slot is a fact about the bundle; this file turns that fact
 * into an actual WordPress `core/template-part` block inclusion. See
 * `chromeDetect.ts` for the classification rationale.
 *
 * The `<!-- wp:template-part --/>` inclusion for the header/footer part.
 * Emitted as a single, self-closing top-level block — matching real
 * WordPress themes exactly (e.g. Twenty Twenty-Four's `templates/index.html`,
 * which places header/footer template-parts as direct siblings of the page
 * content, never nested inside a wrapper).
 *
 * `core/template-part` is itself a real, server-rendered block with its
 * own wrapper element and standard `className` support — a hand-authored,
 * scoped CSS rule for stacking overrides goes directly on the `className`
 * attr here, with no extra wrapping block needed at all. This was a
 * two-step correction from earlier versions of this project: an original
 * bare `<div>` wrapper had no block backing it (a structural
 * parser/validation failure); wrapping in a real `core/group` fixed that
 * and validated correctly, but nested header/footer inside the page's
 * content structure — non-idiomatic and not how real themes are built.
 * Putting the class directly on `template-part` itself is both simpler
 * and correct.
 *
 * Every generated theme now has exactly one shared `templates/page.html`
 * (see generateThemeFiles.ts), not one Template per design — so there's
 * no longer a per-design slot to hang a `.tpl-part-{area}--{designSlug}`
 * scoped z-index override on; the header/footer inclusion is now written
 * once and shared by every Page. An earlier version of this project
 * scoped the z-index per design because it was derived from that design's
 * own Figma paint order (whether the design happened to place overlapping
 * content behind or in front of its header/footer). The direction taken
 * instead: simplify to "chrome is always on top" — a single fixed z-index
 * high enough to beat any content-side z-index a design's own overlapping
 * child could get from its (typically small, single-digit) Figma paint
 * order. This reproduces the one real case this project has actually
 * built against (a hero image sliding up underneath a transparent header)
 * but gives up the general ability for a design to intentionally place
 * content *above* chrome instead — accepted as a reasonable trade, not
 * something any design has needed yet. `position: relative` is included
 * alongside the z-index — `z-index` is a no-op on a statically-positioned
 * element, and this wrapper has no other reason to already be positioned.
 * This is what makes the header/footer able to stack correctly in front
 * of content that stayed in a design's own content pattern — that
 * content's own top-level root already gets `position: relative` from
 * `mapContainer`'s `needsPositionedAnchor`, so both sides of the boundary
 * share one real stacking context. `zIndex`/`stylesheet` are optional —
 * omitted, this renders with no stacking claim either way.
 */
export const templatePartInclusion = (
  area: TemplatePartArea,
  zIndex?: number,
  stylesheet?: Stylesheet,
): RawBlockChild => ({
  renderRaw: (depth: number) => {
    const indent = indentStr(depth);
    const wrapperClass = `tpl-part-${area}`;
    if (zIndex !== undefined && stylesheet) {
      // "container" kind — this is always the same fixed wrapperClass
      // ("tpl-part-header"/"tpl-part-footer"), never node-id-based, so the
      // dedup is a no-op here either way; the kind param just needs a
      // value.
      addRule(
        stylesheet,
        "container",
        wrapperClass,
        `position: relative; z-index: ${zIndex}`,
      );
    }
    return `${indent}<!-- wp:template-part {"slug":"${area}","area":"${area}","className":"${wrapperClass}"} /-->`;
  },
});

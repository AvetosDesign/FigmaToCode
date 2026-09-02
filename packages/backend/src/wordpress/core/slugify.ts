/**
 * Raw Figma layerName -> WordPress template slug/filename, with collision
 * handling across a bundle's designs[] — this is explicitly a Stage 2
 * concern (the bundle itself carries only the raw name).
 */
export const toSlug = (value: string): string =>
  (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "untitled";

/**
 * WordPress's own `getColorClassName`/`getFontSizeClass` helpers
 * (`@wordpress/block-editor`) kebab-case a preset slug when reconstructing
 * `has-{slug}-color`/`has-{slug}-font-size` classes in `save()` — and that
 * transform splits at letter<->digit boundaries, not just at existing
 * separators. A slug like `toSlug` alone produces from a hash-like Figma
 * variable name (e.g. "a62e518e83452d..." staying as one unbroken run)
 * will never match what WP's own kebabCase reconstructs from the same
 * string, causing a permanent "Block contains unexpected or invalid
 * content" no other fix can address — confirmed by comparing our output
 * against markup WordPress's own editor UI generated natively for the
 * same conceptual color pick. Any slug that becomes a WP preset
 * (theme.json color/fontSize/fontFamily entries) needs this splitting
 * applied so it's already idempotent under WP's transform.
 */
const insertWordBoundaries = (value: string): string =>
  value
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .replace(/([0-9])([a-zA-Z])/g, "$1-$2");

export const toPresetSlug = (value: string): string =>
  insertWordBoundaries(toSlug(value));

/**
 * Assigns a unique slug per name, appending -2/-3/... on collision (stable,
 * first-seen-wins order). `slugFn` defaults to `toSlug` (template
 * filenames); pass `toPresetSlug` for anything that becomes a WP preset
 * slug instead (see `toPresetSlug`'s own doc comment above).
 *
 * The suffix search checks against every slug *already emitted*
 * (including earlier suffixed ones), not just how many times the base
 * has been seen -- a plain per-base counter can still hand out a
 * duplicate: `["Hero", "Hero", "Hero 2"]` would previously produce
 * `["hero", "hero-2", "hero-2"]`, because the third name's own base
 * ("hero-2") collides with the second name's *suffixed* slug, which the
 * counter never recorded. Downstream writers key output files on these
 * slugs, so a collision here means one design's file silently overwrites
 * another's in the generated archive.
 */
export const assignUniqueSlugs = (
  names: readonly string[],
  slugFn: (value: string) => string = toSlug,
): string[] => {
  const used = new Set<string>();
  return names.map((name) => {
    const base = slugFn(name);
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let suffix = 2;
    let candidate = `${base}-${suffix}`;
    while (used.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    used.add(candidate);
    return candidate;
  });
};

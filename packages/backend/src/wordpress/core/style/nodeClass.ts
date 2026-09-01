/**
 * Deterministic, stable per-node CSS class, used as the hook for every
 * generated stylesheet rule. Based on the Figma node id (already
 * unique within a bundle) rather than a content hash — stable across
 * regenerations of the same design, which matters for the same reason
 * the per-design template-part wrapper classes are stable: someone might
 * hand-author an override CSS rule targeting a specific generated class,
 * and that shouldn't silently break just because unrelated content
 * elsewhere in the file changed.
 */
export const nodeClassFor = (nodeId: string): string =>
  `wpfg-${nodeId.replace(/[^a-zA-Z0-9]+/g, "-")}`;

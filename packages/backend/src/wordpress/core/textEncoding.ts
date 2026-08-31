/**
 * Portable UTF-8 text encoding, matching the exact feature-detection
 * pattern FigmaToCode's own `packages/backend/src/zipGenerator.ts` and
 * `designBundleUtils.ts` already use — the Figma plugin sandbox doesn't
 * provide the `TextEncoder` global (confirmed by those modules' own doc
 * comments), so anything that needs to run there has to fall back to the
 * `unescape(encodeURIComponent(...))` trick for turning a JS string into
 * UTF-8 bytes.
 *
 * Phase 9: `generateThemeFiles.ts`/`generatePatternFiles.ts` used to hand
 * plain strings straight to `node:fs`'s `writeFileSync`, which encodes to
 * UTF-8 on Node's behalf. Now that both write through `OutputSink.write`
 * (`Uint8Array` only, no implicit string handling — a sink has no
 * business assuming any particular text encoding for what might be
 * arbitrary binary asset bytes), every text-producing call site needs its
 * own explicit encode step, and this is that step, shared so both files
 * do it the same portable way.
 */
export const encodeText = (text: string): Uint8Array => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text);
  }

  const utf8 = unescape(encodeURIComponent(text));
  const bytes = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i += 1) {
    bytes[i] = utf8.charCodeAt(i);
  }
  return bytes;
};

/**
 * F2C port addition: the decode-side counterpart to `encodeText` above,
 * needed by `theme/generateThemeFiles.ts`'s `nextThemeVersion` (which
 * used to decode a previously-written style.css via Node's `Buffer.from(
 * bytes).toString("utf-8")` -- `Buffer` is a Node global, unavailable in
 * the Figma plugin sandbox same as `TextEncoder`/`TextDecoder` aren't
 * guaranteed there). Same feature-detection-with-fallback shape as
 * `encodeText`, just inverted.
 */
export const decodeText = (bytes: Uint8Array): string => {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(binary));
};

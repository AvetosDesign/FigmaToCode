import { strToU8 } from "fflate";

// Figma's plugin sandbox does not provide the `TextEncoder` global (it's a
// restricted JS environment, not a browser or Node) — confirmed at runtime
// via `TextEncoder is not defined` when exporting SVG assets. Every place
// that needs UTF-8 bytes from a string must go through this manual
// fallback rather than assuming `TextEncoder` exists.
//
// The fallback uses `fflate`'s `strToU8` (already a dependency — see
// designBundleZip.ts's `zipSync` import — so this doesn't pull in anything
// new) instead of the old `unescape(encodeURIComponent(...))` trick, which
// relies on a deprecated global and does the same UTF-8-bytes-from-string
// job less directly.
export const encodeUtf8Text = (text: string): Uint8Array => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text);
  }
  return strToU8(text);
};

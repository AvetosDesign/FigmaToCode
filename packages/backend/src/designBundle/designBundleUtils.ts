// Figma's plugin sandbox does not provide the `TextEncoder` global (it's a
// restricted JS environment, not a browser or Node) — confirmed at runtime
// via `TextEncoder is not defined` when exporting SVG assets. Every place
// that needs UTF-8 bytes from a string must go through this manual
// fallback rather than assuming `TextEncoder` exists.
export const encodeUtf8Text = (text: string): Uint8Array => {
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

/**
 * F2C port. Forked from `theme-creator-for-figma/cli/src/core/
 * outputSink.ts` with the Node-only `createNodeDiskSink` dropped --
 * a Figma plugin sandbox has no `node:fs`/`node:path`, and F2C's own
 * generation flow only ever needs the in-memory sink (feeding straight
 * into `fflate`'s `zipSync`, the same mechanism `packages/backend/src/
 * zipGenerator.ts` already uses for its own in-plugin zip building). The
 * CLI keeps the disk-backed sink for its own `--out <dir>` flag; this
 * copy doesn't need it and intentionally doesn't carry the `node:fs`/
 * `node:path` imports that would come with it.
 *
 * Interface and in-memory implementation are otherwise unchanged from the
 * CLI original -- see that file's own doc comments for the full design
 * rationale (why `write`/`readPrevious`/`describe` is the whole surface,
 * and why `readPrevious` always returning `undefined` here is correct,
 * not a limitation).
 */
export interface OutputSink {
  write(relativePath: string, bytes: Uint8Array): void;
  readPrevious(relativePath: string): Uint8Array | undefined;
  describe(): string;
}

export const createInMemorySink = (): OutputSink & {
  files: Record<string, Uint8Array>;
} => {
  const files: Record<string, Uint8Array> = {};
  return {
    files,
    write(relativePath, bytes) {
      files[relativePath] = bytes;
    },
    readPrevious() {
      return undefined;
    },
    describe() {
      return "<in-memory>";
    },
  };
};

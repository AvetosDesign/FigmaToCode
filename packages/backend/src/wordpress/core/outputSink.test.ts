import { describe, expect, it } from "vitest";
import { createInMemorySink } from "./outputSink";

// F2C port: only createInMemorySink exists in this fork (see outputSink.ts's
// doc comment) -- the CLI original's createNodeDiskSink tests are dropped,
// not adapted, since there's no disk-backed sink here to test.

describe("createInMemorySink", () => {
  it("write() lands directly in .files, keyed by the given relative path", () => {
    const sink = createInMemorySink();
    const bytes = new Uint8Array([1, 2, 3]);
    sink.write("assets/hero.png", bytes);
    expect(sink.files["assets/hero.png"]).toBe(bytes);
  });

  it("readPrevious always returns undefined -- no 'previous run' concept in-memory", () => {
    const sink = createInMemorySink();
    sink.write("style.css", new TextEncoder().encode("Version: 0.3.0"));
    expect(sink.readPrevious("style.css")).toBeUndefined();
  });

  it("describe() returns a fixed in-memory label", () => {
    expect(createInMemorySink().describe()).toBe("<in-memory>");
  });
});

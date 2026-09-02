import { describe, expect, it } from "vitest";
import { fontStyleToWeight } from "./designBundleTextStyles";

/**
 * fontStyleToWeight used to keep its own independent copy of the
 * keyword-match table now shared via common/convertFontWeight -- a
 * CodeRabbit nitpick on PR #264 pointed out the duplication (and the
 * risk of the two drifting), and that this file's own copy didn't
 * recognize hyphenated style names ("Semi-Bold", "Extra-Light") the
 * shared helper does. These cases specifically cover what the old
 * duplicate got wrong.
 */
describe("fontStyleToWeight", () => {
  it("maps common named styles to their numeric weight", () => {
    expect(fontStyleToWeight("Regular")).toBe("400");
    expect(fontStyleToWeight("Bold")).toBe("700");
    expect(fontStyleToWeight("Thin")).toBe("100");
    expect(fontStyleToWeight("Black Italic")).toBe("900");
  });

  it("recognizes hyphenated style names via the shared convertFontWeight table", () => {
    expect(fontStyleToWeight("Semi-Bold")).toBe("600");
    expect(fontStyleToWeight("Extra-Light")).toBe("200");
    expect(fontStyleToWeight("Ultra-Bold")).toBe("800");
  });

  it('falls back to "400" for undefined or unrecognized style names', () => {
    expect(fontStyleToWeight(undefined)).toBe("400");
    expect(fontStyleToWeight("Some Custom Style")).toBe("400");
  });
});

import { describe, expect, it } from "vitest";

import { formatDistanceMiles } from "./format-distance";

describe("formatDistanceMiles", () => {
  it("says 1 英里内 under a mile, one decimal under 100, whole miles beyond", () => {
    expect(formatDistanceMiles(0.3)).toBe("1 英里内");
    expect(formatDistanceMiles(2.34)).toBe("约 2.3 英里");
    expect(formatDistanceMiles(12.68)).toBe("约 12.7 英里");
    expect(formatDistanceMiles(230.6)).toBe("约 231 英里");
  });
});

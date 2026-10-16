import { describe, expect, it } from "vitest";

import { generateDefaultDisplayName, isDefaultDisplayName } from "./default-display-name";

describe("generateDefaultDisplayName", () => {
  it("is 同城用户 followed by 4 zero-padded digits", () => {
    expect(generateDefaultDisplayName(() => 0.0042)).toBe("同城用户0042");
    expect(generateDefaultDisplayName(() => 0.99999)).toBe("同城用户9999");
  });

  it("always produces a name recognised as default", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isDefaultDisplayName(generateDefaultDisplayName())).toBe(true);
    }
  });
});

describe("isDefaultDisplayName", () => {
  it.each(["Alice", "同城用户", "同城用户12345", "我是同城用户1234", "", null, undefined])(
    "returns false for %s",
    (name) => {
      expect(isDefaultDisplayName(name)).toBe(false);
    }
  );
});

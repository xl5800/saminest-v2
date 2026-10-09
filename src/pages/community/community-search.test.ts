import { describe, expect, it } from "vitest";

import { filterCommunitiesByKeyword } from "./community-search";

const base = { memberCount: 0, isOfficial: false, stateCodes: [] as string[] };
const communities = [
  { ...base, id: "c-1", name: "DMV 华人社区", slug: "dmv", description: "本地华人讨论区" },
  { ...base, id: "c-2", name: "DMV 宠物社区", slug: "dmv-pets", description: null },
  { ...base, id: "c-3", name: "DMV 留学生社区", slug: "dmv-students", description: "Students" }
];

describe("filterCommunitiesByKeyword", () => {
  it("returns nothing for a blank keyword", () => {
    expect(filterCommunitiesByKeyword(communities, "  ")).toEqual([]);
  });

  it("matches by name, description (case-insensitive) or slug", () => {
    expect(filterCommunitiesByKeyword(communities, "宠物").map((c) => c.id)).toEqual(["c-2"]);
    expect(filterCommunitiesByKeyword(communities, "讨论区").map((c) => c.id)).toEqual(["c-1"]);
    expect(filterCommunitiesByKeyword(communities, "students").map((c) => c.id)).toEqual(["c-3"]);
    expect(filterCommunitiesByKeyword(communities, "dmv")).toHaveLength(3);
  });
});

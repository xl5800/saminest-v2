import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { toggleIdInCachedList } from "./optimistic-id-list";

// 原生感 A 批：收藏点了立即生效，失败改回去。
describe("toggleIdInCachedList", () => {
  it("adds or removes the id right away and can put it back", async () => {
    const queryClient = new QueryClient();
    const key = ["favorites", "user-1"];
    queryClient.setQueryData(key, ["a", "b"]);

    const rollbackAdd = await toggleIdInCachedList(queryClient, key, "c", true);
    expect(queryClient.getQueryData(key)).toEqual(["a", "b", "c"]);
    rollbackAdd();
    expect(queryClient.getQueryData(key)).toEqual(["a", "b"]);

    await toggleIdInCachedList(queryClient, key, "a", false);
    expect(queryClient.getQueryData(key)).toEqual(["b"]);
  });

  it("does not duplicate an id and works when nothing is cached yet", async () => {
    const queryClient = new QueryClient();
    const key = ["favorites", "user-1"];

    await toggleIdInCachedList(queryClient, key, "a", true);
    await toggleIdInCachedList(queryClient, key, "a", true);
    expect(queryClient.getQueryData(key)).toEqual(["a"]);
  });
});

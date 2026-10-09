import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { CommunityBrowsePage } from "../pages/community/community-browse-page";
import { CommunityFeedPage } from "../pages/community/community-feed-page";
import { CommunityPostDetailPage } from "../pages/community/community-post-detail-page";
import { router } from "./routes";

/**
 * 阶段九：社区路由拆成两级（/community 浏览页、单个社区 Feed）。阶段十三：Feed 路由
 * 从字面量 community/dmv 改成参数化的 community/:slug，并新增 community/:slug/new。
 *
 * 为什么单独开这个文件：routes.test.tsx 用的是它自己手写的一份并行路由树
 * （见该文件 renderAt 里的注释），不是 routes.tsx 里真正导出的 router——
 * 在那份并行树里把路由配对了，不代表真正的 routes.tsx 也配对了，改漏一边
 * 测试照样全绿。这里直接检查真正导出的 router，把"真实配置"这一半钉死。
 */

interface RouteLike {
  path?: string;
  element?: ReactElement | null;
  children?: RouteLike[];
}

function findRootChild(path: string): RouteLike | undefined {
  const root = router.routes[0] as RouteLike;
  return root.children?.find((child) => child.path === path);
}

describe("real router: community routes (阶段九)", () => {
  it("mounts the new browse page at /community (not the feed)", () => {
    expect(findRootChild("community")?.element?.type).toBe(CommunityBrowsePage);
  });

  it("mounts the community feed at the parameterised community/:slug (and no longer at a literal community/dmv)", () => {
    expect(findRootChild("community/:slug")?.element?.type).toBe(CommunityFeedPage);
    expect(findRootChild("community/dmv")).toBeUndefined();
  });

  it("registers community/:slug/new (login-gated create page scoped to one community) next to the global community/new", () => {
    const scoped = findRootChild("community/:slug/new")?.element;
    const global = findRootChild("community/new")?.element;

    expect(scoped).toBeDefined();
    expect(scoped?.type).not.toBe(CommunityFeedPage);
    // 两条都是 RequireAuth 包裹同一个发帖页：外层元素类型相同。
    expect(scoped?.type).toBe(global?.type);
  });

  it("keeps /community/post/:id on the post detail page, unchanged", () => {
    expect(findRootChild("community/post/:id")?.element?.type).toBe(CommunityPostDetailPage);
  });

  it("still registers /community/new (login-gated, so its element is a RequireAuth wrapper, not a bare page)", () => {
    const element = findRootChild("community/new")?.element;

    expect(element).toBeDefined();
    expect(element?.type).not.toBe(CommunityBrowsePage);
    expect(element?.type).not.toBe(CommunityFeedPage);
  });

  it("registers each community path exactly once", () => {
    const root = router.routes[0] as RouteLike;
    const communityPaths = (root.children ?? [])
      .map((child) => child.path)
      .filter((path): path is string => typeof path === "string" && path.startsWith("community"));

    expect(new Set(communityPaths).size).toBe(communityPaths.length);
    expect(communityPaths).toEqual(expect.arrayContaining(["community", "community/:slug", "community/new", "community/:slug/new"]));
  });
});

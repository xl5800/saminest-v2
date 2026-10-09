import { describe, expect, it } from "vitest";

import type { Comment } from "../repositories/comments-repository";
import { buildCommentTree, sortCommentTree } from "./build-comment-tree";

function makeComment(overrides: Partial<Comment> & Pick<Comment, "id">): Comment {
  return {
    postId: "post-1",
    activityId: null,
    communityPostId: null,
    userId: "user-1",
    parentId: null,
    content: `content-${overrides.id}`,
    authorDisplayName: "Alice",
    authorAvatarUrl: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    isDeleted: false,
    ...overrides
  };
}

describe("buildCommentTree", () => {
  it("returns an empty array for an empty input", () => {
    expect(buildCommentTree([])).toEqual([]);
  });

  it("builds a two-level tree (root comment with direct replies)", () => {
    const comments = [
      makeComment({ id: "c1", parentId: null }),
      makeComment({ id: "c2", parentId: "c1" }),
      makeComment({ id: "c3", parentId: "c1" })
    ];

    const tree = buildCommentTree(comments);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("c1");
    expect(tree[0].children.map((node) => node.id)).toEqual(["c2", "c3"]);
    expect(tree[0].children[0].children).toEqual([]);
  });

  it("builds a three-level tree (reply to a reply)", () => {
    const comments = [
      makeComment({ id: "c1", parentId: null }),
      makeComment({ id: "c2", parentId: "c1" }),
      makeComment({ id: "c3", parentId: "c2" })
    ];

    const tree = buildCommentTree(comments);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("c1");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe("c2");
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].id).toBe("c3");
  });

  it("treats a comment whose parentId points to a missing comment as a top-level node instead of throwing", () => {
    const comments = [
      makeComment({ id: "c1", parentId: null }),
      makeComment({ id: "c2", parentId: "does-not-exist" })
    ];

    expect(() => buildCommentTree(comments)).not.toThrow();
    const tree = buildCommentTree(comments);

    expect(tree.map((node) => node.id).sort()).toEqual(["c1", "c2"]);
    expect(tree.every((node) => node.children.length === 0)).toBe(true);
  });

  it("preserves the original created_at order within each level (top-level and within children)", () => {
    const comments = [
      makeComment({ id: "root-b", parentId: null, createdAt: "2026-08-04T00:02:00.000Z" }),
      makeComment({ id: "root-a", parentId: null, createdAt: "2026-08-04T00:01:00.000Z" }),
      makeComment({ id: "reply-2", parentId: "root-b", createdAt: "2026-08-04T00:04:00.000Z" }),
      makeComment({ id: "reply-1", parentId: "root-b", createdAt: "2026-08-04T00:03:00.000Z" })
    ];

    const tree = buildCommentTree(comments);

    // buildCommentTree does not re-sort — it trusts the array order the
    // caller (listPostComments, already sorted by created_at ascending)
    // passed in, so the output order here mirrors the input array order.
    expect(tree.map((node) => node.id)).toEqual(["root-b", "root-a"]);
    const rootB = tree.find((node) => node.id === "root-b");
    expect(rootB?.children.map((node) => node.id)).toEqual(["reply-2", "reply-1"]);
  });
});

describe("sortCommentTree", () => {
  const comments = [
    makeComment({ id: "a", createdAt: "2026-08-01T00:00:00.000Z" }),
    makeComment({ id: "b", createdAt: "2026-08-02T00:00:00.000Z" }),
    makeComment({ id: "c", createdAt: "2026-08-03T00:00:00.000Z" }),
    makeComment({ id: "a1", parentId: "a", createdAt: "2026-08-04T00:00:00.000Z" }),
    makeComment({ id: "a2", parentId: "a", createdAt: "2026-08-05T00:00:00.000Z" }),
    makeComment({ id: "b1", parentId: "b", createdAt: "2026-08-06T00:00:00.000Z" })
  ];

  it("latest: orders top-level comments newest first, keeping each thread's replies in original order", () => {
    const sorted = sortCommentTree(buildCommentTree(comments), "latest");

    expect(sorted.map((n) => n.id)).toEqual(["c", "b", "a"]);
    expect(sorted.find((n) => n.id === "a")?.children.map((n) => n.id)).toEqual(["a1", "a2"]);
  });

  it("hot: orders top-level comments by direct reply count desc, ties newest first", () => {
    const sorted = sortCommentTree(buildCommentTree(comments), "hot");

    // a 有 2 条回复，b 有 1 条，c 没有。
    expect(sorted.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("hot: breaks reply-count ties by newest first", () => {
    const tied = [
      makeComment({ id: "x", createdAt: "2026-08-01T00:00:00.000Z" }),
      makeComment({ id: "y", createdAt: "2026-08-02T00:00:00.000Z" })
    ];

    expect(sortCommentTree(buildCommentTree(tied), "hot").map((n) => n.id)).toEqual(["y", "x"]);
  });

  it("hot: does not count deleted replies as heat", () => {
    const withDeleted = [
      makeComment({ id: "p", createdAt: "2026-08-01T00:00:00.000Z" }),
      makeComment({ id: "q", createdAt: "2026-08-02T00:00:00.000Z" }),
      makeComment({ id: "p1", parentId: "p", isDeleted: true }),
      makeComment({ id: "p2", parentId: "p", isDeleted: true }),
      makeComment({ id: "q1", parentId: "q" })
    ];

    expect(sortCommentTree(buildCommentTree(withDeleted), "hot").map((n) => n.id)).toEqual([
      "q",
      "p"
    ]);
  });

  it("does not mutate its input and never moves a reply out of its parent", () => {
    const tree = buildCommentTree(comments);
    const before = tree.map((n) => n.id);

    const sorted = sortCommentTree(tree, "latest");

    expect(tree.map((n) => n.id)).toEqual(before);
    expect(sorted.flatMap((n) => n.children.map((c) => c.id)).sort()).toEqual(["a1", "a2", "b1"]);
  });
});

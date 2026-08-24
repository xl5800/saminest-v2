import { beforeEach, describe, expect, it, vi } from "vitest";

// 跟 favorites-repository.test.ts 是同一套 mock 风格：一个共享的链式
// query builder，每个方法各自一个可控的 mock，eq() 需要能连续链式调用两次
// （blocker_id / blocked_id）才走到 maybeSingle() 这个终点，所以在
// beforeEach 里让它 mockReturnValue(builder) 而不是直接 resolve。order/
// overrideTypes 是 13 号卡新增的 listMyBlockedUsers 用的（select().eq().
// order().overrideTypes() 这条链路），跟 reports-repository.test.ts 里
// listReportsForModeration 的 mock 方式一致。
const {
  queryBuilder,
  eqMock,
  insertMock,
  matchMock,
  maybeSingleMock,
  orderMock,
  overrideTypesMock,
  rpcMock
} = vi.hoisted(() => {
  const eqMock = vi.fn();
  const insertMock = vi.fn();
  const matchMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const orderMock = vi.fn();
  const overrideTypesMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = eqMock;
  builder.insert = insertMock;
  builder.delete = vi.fn(() => builder);
  builder.match = matchMock;
  builder.maybeSingle = maybeSingleMock;
  builder.order = orderMock;
  builder.overrideTypes = overrideTypesMock;
  const rpcMock = vi.fn();
  return {
    queryBuilder: builder,
    eqMock,
    insertMock,
    matchMock,
    maybeSingleMock,
    orderMock,
    overrideTypesMock,
    rpcMock
  };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock, rpc: rpcMock })
}));

import {
  blockUser,
  isBlockedWithUser,
  isBlockingUser,
  listMyBlockedUsers,
  unblockUser
} from "./user-blocks-repository";

describe("isBlockingUser", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.select.mockClear();
    eqMock.mockReset();
    eqMock.mockReturnValue(queryBuilder);
    maybeSingleMock.mockReset();
  });

  it("queries user_blocks by blocker_id/blocked_id and returns true when a row exists", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "block-1" }, error: null });

    const result = await isBlockingUser("user-1", "user-2");

    expect(fromMock).toHaveBeenCalledWith("user_blocks");
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(eqMock).toHaveBeenNthCalledWith(1, "blocker_id", "user-1");
    expect(eqMock).toHaveBeenNthCalledWith(2, "blocked_id", "user-2");
    expect(result).toBe(true);
  });

  it("returns false when no row exists", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    expect(await isBlockingUser("user-1", "user-2")).toBe(false);
  });

  it("throws an AppError when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(isBlockingUser("user-1", "user-2")).rejects.toMatchObject({
      code: "USER_BLOCK_STATUS_FETCH_FAILED"
    });
  });
});

describe("blockUser", () => {
  beforeEach(() => {
    fromMock.mockClear();
    insertMock.mockReset();
  });

  it("inserts a user_blocks row for the given blocker and blocked user", async () => {
    insertMock.mockResolvedValue({ error: null });

    await blockUser({ blockerId: "user-1", blockedId: "user-2" });

    expect(fromMock).toHaveBeenCalledWith("user_blocks");
    expect(insertMock).toHaveBeenCalledWith({
      blocker_id: "user-1",
      blocked_id: "user-2"
    });
  });

  // 跟 favorites-repository.ts 的 addFavorite 同一个理由：双击/多标签页
  // 竞态导致的重复屏蔽会撞上 user_blocks_blocker_blocked_unique_idx
  // 唯一约束（23505），这里当成"已经屏蔽成功"处理，不向上抛错。
  it("treats a unique-violation error as an idempotent success", async () => {
    insertMock.mockResolvedValue({
      error: { message: "duplicate key value", code: "23505" }
    });

    await expect(blockUser({ blockerId: "user-1", blockedId: "user-2" })).resolves.toBeUndefined();
  });

  it("throws an AppError for any other insert failure (e.g. the self-block check constraint)", async () => {
    insertMock.mockResolvedValue({
      error: { message: "new row for relation \"user_blocks\" violates check constraint \"user_blocks_no_self_block\"", code: "23514" }
    });

    await expect(
      blockUser({ blockerId: "user-1", blockedId: "user-1" })
    ).rejects.toMatchObject({ code: "USER_BLOCK_CREATE_FAILED" });
  });
});

describe("unblockUser", () => {
  beforeEach(() => {
    fromMock.mockClear();
    matchMock.mockReset();
  });

  it("deletes the user_blocks row matching the blocker and blocked user", async () => {
    matchMock.mockResolvedValue({ error: null });

    await unblockUser({ blockerId: "user-1", blockedId: "user-2" });

    expect(fromMock).toHaveBeenCalledWith("user_blocks");
    expect(queryBuilder.delete).toHaveBeenCalled();
    expect(matchMock).toHaveBeenCalledWith({
      blocker_id: "user-1",
      blocked_id: "user-2"
    });
  });

  it("throws an AppError when the delete fails", async () => {
    matchMock.mockResolvedValue({
      error: { message: "delete failed", code: "500" }
    });

    await expect(
      unblockUser({ blockerId: "user-1", blockedId: "user-2" })
    ).rejects.toMatchObject({ code: "USER_BLOCK_REMOVE_FAILED" });
  });
});

describe("isBlockedWithUser", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  // 修复 is_blocked_pair(uuid, uuid) 越权查询漏洞之后改的名字/签名——见
  // supabase/migrations/20260823000000_restrict_is_blocked_pair_to_caller.sql：
  // 只接受一个参数（对方 id），"我是谁"由后端从 auth.uid() 自己判断，
  // 调用方不能再传两个任意用户 id 查询"不是自己"的两人之间的关系。
  it("calls the is_blocked_with RPC with only the other user's id and returns its boolean result", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });

    const result = await isBlockedWithUser("user-2");

    expect(rpcMock).toHaveBeenCalledWith("is_blocked_with", {
      other_user_id: "user-2"
    });
    expect(result).toBe(true);
  });

  it("returns false when the RPC resolves with null data", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    expect(await isBlockedWithUser("user-2")).toBe(false);
  });

  it("throws an AppError when the RPC call fails", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(isBlockedWithUser("user-2")).rejects.toMatchObject({
      code: "USER_BLOCKED_PAIR_CHECK_FAILED"
    });
  });
});

// 13 号卡（"我的"页新增"已屏蔽"管理入口）。
describe("listMyBlockedUsers", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.select.mockClear();
    eqMock.mockReset();
    eqMock.mockReturnValue(queryBuilder);
    orderMock.mockReset();
    orderMock.mockReturnValue(queryBuilder);
    overrideTypesMock.mockReset();
  });

  it("queries user_blocks filtered by blocker_id, disambiguating the profiles join via the blocked_id fkey, ordered by created_at desc", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          blocked_id: "user-2",
          blocked: { display_name: "Bob", avatar_url: "https://img.example.com/bob.jpg" }
        }
      ],
      error: null
    });

    const result = await listMyBlockedUsers("user-1");

    expect(fromMock).toHaveBeenCalledWith("user_blocks");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "blocked_id, blocked:profiles!user_blocks_blocked_id_fkey(display_name, avatar_url)"
    );
    expect(eqMock).toHaveBeenCalledWith("blocker_id", "user-1");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([
      { blockedUserId: "user-2", displayName: "Bob", avatarUrl: "https://img.example.com/bob.jpg" }
    ]);
  });

  it("falls back to '未知用户' and a null avatar when the joined profile is missing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [{ blocked_id: "user-2", blocked: null }],
      error: null
    });

    const result = await listMyBlockedUsers("user-1");

    expect(result).toEqual([
      { blockedUserId: "user-2", displayName: "未知用户", avatarUrl: null }
    ]);
  });

  it("returns an empty array when the user hasn't blocked anyone", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listMyBlockedUsers("user-1")).resolves.toEqual([]);
  });

  it("throws an AppError when the query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listMyBlockedUsers("user-1")).rejects.toMatchObject({
      code: "MY_BLOCKED_USERS_LIST_FAILED"
    });
  });
});

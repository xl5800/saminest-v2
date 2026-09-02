import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, overrideTypesMock, singleMock, maybeSingleMock, thenMock } = vi.hoisted(() => {
  const overrideTypesMock = vi.fn();
  const singleMock = vi.fn();
  const maybeSingleMock = vi.fn();
  // 30 号卡新增：真实的 supabase-js query builder本身就是一个 thenable——
  // 不是每次查询都要落到 .single()/.maybeSingle()/.overrideTypes() 这类
  // 显式终结方法才能拿到结果，count-only 的 head:true 查询
  // （hasPendingActivityParticipantsForOrganizer）就是直接 await 整条
  // 链式调用本身，没有再多调用任何终结方法。这里补一个 .then 让这个
  // mock builder 也能被直接 await——包成 vi.fn() 是为了跟其它链式方法
  // 一样能被下面 resetAllMocks() 的 Object.keys 循环统一 mockClear()，
  // 不需要特殊处理。只有真的直接 await 裸 builder（不经过其它三个终结
  // 方法）的调用路径才会用到它，其它既有函数已经都是先落到
  // overrideTypes/single/maybeSingle 三者之一、再 await 它们各自的返回值，
  // 不会受这次新增影响。
  const thenMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = [
    "select",
    "eq",
    "neq",
    "is",
    "in",
    "gte",
    "order",
    "insert",
    "update"
  ] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.overrideTypes = overrideTypesMock;
  builder.single = singleMock;
  builder.maybeSingle = maybeSingleMock;
  builder.then = vi.fn((resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(thenMock()).then(resolve, reject)
  );
  return { queryBuilder: builder, overrideTypesMock, singleMock, maybeSingleMock, thenMock };
});

const fromMock = vi.fn(() => queryBuilder);
const rpcMock = vi.fn();

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock, rpc: rpcMock })
}));

import {
  approveActivityParticipant,
  cancelActivity,
  createActivity,
  getActivityDetail,
  getActivityParticipationStatus,
  hasPendingActivityParticipantsForOrganizer,
  joinActivity,
  leaveActivity,
  listActivities,
  listActivityParticipantPreviews,
  listActivityParticipants,
  listMyJoinedActivities,
  listMyOrganizedActivities,
  listPendingActivityParticipants,
  notifyActivityParticipants,
  rejectActivityParticipant
} from "./activities-repository";

function resetAllMocks(): void {
  fromMock.mockClear();
  rpcMock.mockReset();
  for (const key of Object.keys(queryBuilder)) {
    queryBuilder[key].mockClear();
  }
  overrideTypesMock.mockReset();
  singleMock.mockReset();
  maybeSingleMock.mockReset();
  thenMock.mockReset();
}

describe("listActivities", () => {
  beforeEach(resetAllMocks);

  it("filters to open/full status with start_at in the future, ordered by start_at ascending, with a nested location/organizer select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listActivities();

    expect(fromMock).toHaveBeenCalledWith("activities");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, organizer_id, channel, tag_text, title, location:locations(name), landmark_text, is_online, start_at, capacity, participant_count, status, requires_approval, organizer:profiles(display_name, avatar_url)"
    );
    expect(queryBuilder.in).toHaveBeenCalledWith("status", ["open", "full"]);
    expect(queryBuilder.gte).toHaveBeenCalledWith("start_at", expect.any(String));
    expect(queryBuilder.order).toHaveBeenCalledWith("start_at", { ascending: true });
    expect(queryBuilder.eq).not.toHaveBeenCalled();
  });

  it("also filters by channel when provided", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listActivities({ channel: "food" });

    expect(queryBuilder.eq).toHaveBeenCalledWith("channel", "food");
  });

  // 08 号卡：locationId 换成了 stateCode——筛选一个州时，location 这一列
  // 的联表从左连接换成 `locations!inner(...)`（PostgREST 要求这么写才能
  // 对内嵌表的列做过滤），select 字符串也要跟着变，见
  // activities-repository.ts 的 buildActivityListSelectColumns。
  it("also filters by stateCode when provided, switching the location join to an inner join", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listActivities({ stateCode: "VA" });

    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, organizer_id, channel, tag_text, title, location:locations!inner(name, state_code), landmark_text, is_online, start_at, capacity, participant_count, status, requires_approval, organizer:profiles(display_name, avatar_url)"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("location.state_code", "VA");
  });

  it("does not switch to an inner join when stateCode is not provided (unfiltered browsing keeps location-less activities)", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listActivities();

    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, organizer_id, channel, tag_text, title, location:locations(name), landmark_text, is_online, start_at, capacity, participant_count, status, requires_approval, organizer:profiles(display_name, avatar_url)"
    );
  });

  it("maps rows to ActivityListItem, resolving the joined location name, organizer identity and requiresApproval", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "act-1",
          organizer_id: "user-1",
          channel: "food",
          tag_text: "火锅",
          title: "周末吃火锅",
          location: { name: "Rockville" },
          landmark_text: "海底捞",
          is_online: false,
          start_at: "2026-08-20T18:00:00.000Z",
          capacity: 4,
          participant_count: 2,
          status: "open",
          requires_approval: true,
          organizer: { display_name: "Alice", avatar_url: "https://img.example.com/alice.jpg" }
        }
      ],
      error: null
    });

    const result = await listActivities();

    expect(result).toEqual([
      {
        id: "act-1",
        organizerId: "user-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: "https://img.example.com/alice.jpg",
        channel: "food",
        tagText: "火锅",
        title: "周末吃火锅",
        locationName: "Rockville",
        landmarkText: "海底捞",
        isOnline: false,
        startAt: "2026-08-20T18:00:00.000Z",
        capacity: 4,
        participantCount: 2,
        status: "open",
        requiresApproval: true
      }
    ]);
  });

  it("resolves locationName to null when there is no joined location (e.g. an online activity)", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "act-1",
          organizer_id: "user-1",
          channel: "game",
          tag_text: null,
          title: "线上开黑",
          location: null,
          landmark_text: null,
          is_online: true,
          start_at: "2026-08-20T18:00:00.000Z",
          capacity: null,
          participant_count: 1,
          status: "open",
          requires_approval: false,
          organizer: null
        }
      ],
      error: null
    });

    const result = await listActivities();

    expect(result[0].locationName).toBeNull();
  });

  it("falls back to a placeholder organizer name and null avatar when the joined organizer is missing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "act-1",
          organizer_id: "user-1",
          channel: "game",
          tag_text: null,
          title: "线上开黑",
          location: null,
          landmark_text: null,
          is_online: true,
          start_at: "2026-08-20T18:00:00.000Z",
          capacity: null,
          participant_count: 1,
          status: "open",
          requires_approval: false,
          organizer: null
        }
      ],
      error: null
    });

    const result = await listActivities();

    expect(result[0].organizerDisplayName).toBe("未知用户");
    expect(result[0].organizerAvatarUrl).toBeNull();
  });

  it("returns an empty list without throwing when there are no matching activities", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listActivities()).resolves.toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listActivities()).rejects.toMatchObject({ code: "ACTIVITIES_LIST_FAILED" });
  });
});

describe("getActivityDetail", () => {
  beforeEach(() => {
    resetAllMocks();
    // getActivityDetail 在 .maybeSingle() 之后还链式调用 .overrideTypes()，
    // 跟 posts-repository.test.ts 里 getPostDetail 的处理方式一致。
    maybeSingleMock.mockReturnValue(queryBuilder);
  });

  it("selects by id with a nested location/organizer select and no extra status/deleted_at filtering (RLS decides visibility)", async () => {
    overrideTypesMock.mockResolvedValue({ data: null, error: null });

    await getActivityDetail("act-1");

    expect(fromMock).toHaveBeenCalledWith("activities");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, organizer_id, channel, tag_text, title, description, location_id, landmark_text, is_online, start_at, capacity, participant_count, contact_method, contact_value, status, requires_approval, location:locations(name), organizer:profiles(display_name, avatar_url)"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "act-1");
    expect(queryBuilder.eq).not.toHaveBeenCalledWith("status", expect.anything());
    expect(queryBuilder.is).not.toHaveBeenCalled();
  });

  it("maps a full row to ActivityDetail, including requiresApproval", async () => {
    overrideTypesMock.mockResolvedValue({
      data: {
        id: "act-1",
        organizer_id: "user-1",
        channel: "food",
        tag_text: "火锅",
        title: "周末吃火锅",
        description: "一起吃火锅，AA制",
        location_id: "loc-1",
        landmark_text: "海底捞",
        is_online: false,
        start_at: "2026-08-20T18:00:00.000Z",
        capacity: 4,
        participant_count: 2,
        contact_method: "wechat",
        contact_value: "abc123",
        status: "open",
        requires_approval: true,
        location: { name: "Rockville" },
        organizer: { display_name: "Alice", avatar_url: "https://img.example.com/alice.jpg" }
      },
      error: null
    });

    const result = await getActivityDetail("act-1");

    expect(result).toEqual({
      id: "act-1",
      organizerId: "user-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: "https://img.example.com/alice.jpg",
      channel: "food",
      tagText: "火锅",
      title: "周末吃火锅",
      description: "一起吃火锅，AA制",
      locationId: "loc-1",
      locationName: "Rockville",
      landmarkText: "海底捞",
      isOnline: false,
      startAt: "2026-08-20T18:00:00.000Z",
      capacity: 4,
      participantCount: 2,
      contactMethod: "wechat",
      contactValue: "abc123",
      status: "open",
      requiresApproval: true
    });
  });

  it("falls back to a placeholder organizer name when the joined organizer is missing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: {
        id: "act-1",
        organizer_id: "user-1",
        channel: "food",
        tag_text: null,
        title: "周末吃火锅",
        description: "一起吃火锅",
        location_id: null,
        landmark_text: null,
        is_online: true,
        start_at: "2026-08-20T18:00:00.000Z",
        capacity: null,
        participant_count: 0,
        contact_method: null,
        contact_value: null,
        status: "open",
        requires_approval: false,
        location: null,
        organizer: null
      },
      error: null
    });

    const result = await getActivityDetail("act-1");

    expect(result?.organizerDisplayName).toBe("未知用户");
    expect(result?.organizerAvatarUrl).toBeNull();
    expect(result?.locationName).toBeNull();
  });

  it("returns null without throwing when the activity does not exist or is not visible to the current viewer", async () => {
    overrideTypesMock.mockResolvedValue({ data: null, error: null });

    await expect(getActivityDetail("missing-or-invisible")).resolves.toBeNull();
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(getActivityDetail("act-1")).rejects.toMatchObject({
      code: "ACTIVITY_DETAIL_FETCH_FAILED"
    });
  });
});

describe("createActivity", () => {
  beforeEach(resetAllMocks);

  const validInput = {
    organizerId: "user-1",
    channel: "food",
    tagText: "火锅",
    title: "周末吃火锅",
    description: "一起吃火锅，AA制",
    locationId: "loc-1",
    landmarkText: "海底捞",
    isOnline: false,
    startAt: "2026-08-20T18:00:00.000Z",
    capacity: 4,
    contactMethod: "wechat",
    contactValue: "abc123",
    requiresApproval: false
  };

  it("inserts an activity without a status field (defers to the DB default) and returns the new id", async () => {
    singleMock.mockResolvedValue({ data: { id: "act-1" }, error: null });

    const result = await createActivity(validInput);

    expect(fromMock).toHaveBeenCalledWith("activities");
    expect(queryBuilder.insert).toHaveBeenCalledWith({
      organizer_id: "user-1",
      channel: "food",
      tag_text: "火锅",
      title: "周末吃火锅",
      description: "一起吃火锅，AA制",
      location_id: "loc-1",
      landmark_text: "海底捞",
      is_online: false,
      start_at: "2026-08-20T18:00:00.000Z",
      capacity: 4,
      contact_method: "wechat",
      contact_value: "abc123",
      requires_approval: false
    });
    const insertedPayload = queryBuilder.insert.mock.calls[0][0];
    expect(insertedPayload).not.toHaveProperty("status");
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(result).toEqual({ id: "act-1" });
  });

  it("passes requiresApproval: true through to requires_approval in the insert payload", async () => {
    singleMock.mockResolvedValue({ data: { id: "act-1" }, error: null });

    await createActivity({ ...validInput, requiresApproval: true });

    expect(queryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ requires_approval: true })
    );
  });

  it("throws a distinct ACCOUNT_RESTRICTED AppError with a friendly message on an RLS violation (42501)", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: {
        message: "new row violates row-level security policy for table \"activities\"",
        code: "42501"
      }
    });

    await expect(createActivity(validInput)).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    });
  });

  it("throws a generic AppError when the insert fails for another reason", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "insert failed", code: "500" }
    });

    await expect(createActivity(validInput)).rejects.toMatchObject({
      code: "ACTIVITY_CREATE_FAILED"
    });
  });

  it("throws an AppError when insert succeeds but no row id is returned", async () => {
    singleMock.mockResolvedValue({ data: null, error: null });

    await expect(createActivity(validInput)).rejects.toMatchObject({
      code: "ACTIVITY_CREATE_ID_MISSING"
    });
  });
});

describe("getActivityParticipationStatus", () => {
  beforeEach(resetAllMocks);

  it("queries status/cancelled_at for the given activity and user (no cancelled_at filter — RLS lets a user always read their own row)", async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: "approved", cancelled_at: null }, error: null });

    await getActivityParticipationStatus("act-1", "user-1");

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    expect(queryBuilder.select).toHaveBeenCalledWith("status, cancelled_at");
    expect(queryBuilder.eq).toHaveBeenCalledWith("activity_id", "act-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns 'approved' when the row is approved and not cancelled", async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: "approved", cancelled_at: null }, error: null });

    await expect(getActivityParticipationStatus("act-1", "user-1")).resolves.toBe("approved");
  });

  it("returns 'pending' when the row is pending and not cancelled", async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: "pending", cancelled_at: null }, error: null });

    await expect(getActivityParticipationStatus("act-1", "user-1")).resolves.toBe("pending");
  });

  it("returns 'rejected' when the row is rejected and not cancelled", async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: "rejected", cancelled_at: null }, error: null });

    await expect(getActivityParticipationStatus("act-1", "user-1")).resolves.toBe("rejected");
  });

  it("returns null when no row is found", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(getActivityParticipationStatus("act-1", "user-1")).resolves.toBeNull();
  });

  it("returns null when the row exists but has been left (cancelled_at is not null), regardless of its stored status", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { status: "approved", cancelled_at: "2026-08-01T00:00:00.000Z" },
      error: null
    });

    await expect(getActivityParticipationStatus("act-1", "user-1")).resolves.toBeNull();
  });

  it("throws an AppError when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(getActivityParticipationStatus("act-1", "user-1")).rejects.toMatchObject({
      code: "ACTIVITY_PARTICIPATION_CHECK_FAILED"
    });
  });
});

describe("joinActivity", () => {
  beforeEach(resetAllMocks);

  it("inserts a fresh row with status 'approved' when requiresApproval is false", async () => {
    queryBuilder.insert.mockResolvedValueOnce({ error: null });

    await joinActivity("act-1", "user-1", false);

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    expect(queryBuilder.insert).toHaveBeenCalledWith({
      activity_id: "act-1",
      user_id: "user-1",
      status: "approved"
    });
    // 第一次 insert 就成功时，不应该再走 update 分支。
    expect(queryBuilder.update).not.toHaveBeenCalled();
  });

  it("inserts a fresh row with status 'pending' when requiresApproval is true", async () => {
    queryBuilder.insert.mockResolvedValueOnce({ error: null });

    await joinActivity("act-1", "user-1", true);

    expect(queryBuilder.insert).toHaveBeenCalledWith({
      activity_id: "act-1",
      user_id: "user-1",
      status: "pending"
    });
  });

  it("on a unique-violation (23505), checks the existing row's status first, then re-joins by updating cancelled_at back to null when it's not rejected", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: { message: "duplicate key", code: "23505" }
    });
    maybeSingleMock
      .mockResolvedValueOnce({ data: { status: "approved" }, error: null })
      .mockResolvedValueOnce({ data: { id: "row-1" }, error: null });

    await joinActivity("act-1", "user-1", false);

    expect(queryBuilder.select).toHaveBeenCalledWith("status");
    expect(queryBuilder.update).toHaveBeenCalledWith({ cancelled_at: null });
    expect(queryBuilder.eq).toHaveBeenCalledWith("activity_id", "act-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("throws a distinct ACTIVITY_JOIN_REJECTED AppError, without attempting the update, when the existing row's status is 'rejected'", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: { message: "duplicate key", code: "23505" }
    });
    maybeSingleMock.mockResolvedValueOnce({ data: { status: "rejected" }, error: null });

    await expect(joinActivity("act-1", "user-1", false)).rejects.toMatchObject({
      code: "ACTIVITY_JOIN_REJECTED",
      message: "你的申请已被发起人拒绝，无法重新加入。"
    });
    expect(queryBuilder.update).not.toHaveBeenCalled();
  });

  it("throws ACTIVITY_JOIN_FAILED when the pre-check select itself fails", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: { message: "duplicate key", code: "23505" }
    });
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: "select failed", code: "500" }
    });

    await expect(joinActivity("act-1", "user-1", false)).rejects.toMatchObject({
      code: "ACTIVITY_JOIN_FAILED"
    });
  });

  it("treats a no-op update after a 23505 (row already re-joined, e.g. by a concurrent request) as success", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: { message: "duplicate key", code: "23505" }
    });
    maybeSingleMock
      .mockResolvedValueOnce({ data: { status: "approved" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(joinActivity("act-1", "user-1", false)).resolves.toBeUndefined();
  });

  it("throws ACTIVITY_JOIN_FAILED when the re-join update itself fails", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: { message: "duplicate key", code: "23505" }
    });
    maybeSingleMock
      .mockResolvedValueOnce({ data: { status: "approved" }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "update failed", code: "500" }
      });

    await expect(joinActivity("act-1", "user-1", false)).rejects.toMatchObject({
      code: "ACTIVITY_JOIN_FAILED"
    });
  });

  it("throws a generic ACTIVITY_JOIN_FORBIDDEN AppError (not ACCOUNT_RESTRICTED) on an RLS violation (42501) at insert time, since multiple causes are possible", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: {
        message: "new row violates row-level security policy for table \"activity_participants\"",
        code: "42501"
      }
    });

    await expect(joinActivity("act-1", "user-1", false)).rejects.toMatchObject({
      code: "ACTIVITY_JOIN_FORBIDDEN"
    });
  });

  it("throws a generic ACTIVITY_JOIN_FAILED AppError for any other insert error", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: { message: "network down", code: "500" }
    });

    await expect(joinActivity("act-1", "user-1", false)).rejects.toMatchObject({
      code: "ACTIVITY_JOIN_FAILED"
    });
  });
});

describe("leaveActivity", () => {
  beforeEach(resetAllMocks);

  it("sets cancelled_at to now, scoped to the activity/user/currently-not-cancelled row", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "row-1" }, error: null });

    await leaveActivity("act-1", "user-1");

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    const [payload] = queryBuilder.update.mock.calls[0];
    expect(typeof payload.cancelled_at).toBe("string");
    expect(queryBuilder.eq).toHaveBeenCalledWith("activity_id", "act-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(queryBuilder.is).toHaveBeenCalledWith("cancelled_at", null);
  });

  it("throws an AppError when the update fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "update failed", code: "500" }
    });

    await expect(leaveActivity("act-1", "user-1")).rejects.toMatchObject({
      code: "ACTIVITY_LEAVE_FAILED"
    });
  });

  it("throws ACTIVITY_LEAVE_NOT_FOUND when no row was affected (never joined, or already left)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(leaveActivity("act-1", "user-1")).rejects.toMatchObject({
      code: "ACTIVITY_LEAVE_NOT_FOUND"
    });
  });
});

describe("listActivityParticipants", () => {
  beforeEach(resetAllMocks);

  it("queries non-cancelled, approved participants for the activity, ordered by joined_at ascending, with a nested profile select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listActivityParticipants("act-1");

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "user_id, user:profiles(display_name, avatar_url)"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("activity_id", "act-1");
    // 顺手修的 bug：过滤掉 pending/rejected，只保留已确认参与者，跟
    // sync_activity_participant_count() 触发器统计 participant_count 时
    // 的口径一致。
    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "approved");
    expect(queryBuilder.is).toHaveBeenCalledWith("cancelled_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("joined_at", { ascending: true });
  });

  it("maps rows to ActivityParticipant, including avatarUrl", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          user_id: "user-1",
          user: { display_name: "Alice", avatar_url: "https://img.example.com/alice.jpg" }
        },
        { user_id: "user-2", user: { display_name: "Bob", avatar_url: null } }
      ],
      error: null
    });

    const result = await listActivityParticipants("act-1");

    expect(result).toEqual([
      { userId: "user-1", displayName: "Alice", avatarUrl: "https://img.example.com/alice.jpg" },
      { userId: "user-2", displayName: "Bob", avatarUrl: null }
    ]);
  });

  it("falls back to a placeholder display name and a null avatarUrl when the joined profile is missing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [{ user_id: "user-1", user: null }],
      error: null
    });

    const result = await listActivityParticipants("act-1");

    expect(result[0].displayName).toBe("未知用户");
    expect(result[0].avatarUrl).toBeNull();
  });

  it("returns an empty list without throwing when RLS filters out every row (not the organizer, not currently joined)", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listActivityParticipants("act-1")).resolves.toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listActivityParticipants("act-1")).rejects.toMatchObject({
      code: "ACTIVITY_PARTICIPANTS_LIST_FAILED"
    });
  });
});

describe("listActivityParticipantPreviews", () => {
  beforeEach(resetAllMocks);

  it("returns an empty map without querying at all when given an empty array of activity ids", async () => {
    const result = await listActivityParticipantPreviews([]);

    expect(result).toEqual(new Map());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("queries approved, non-cancelled participants across the given activity ids, ordered by joined_at ascending, with a nested profile select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listActivityParticipantPreviews(["act-1", "act-2"]);

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "activity_id, user_id, user:profiles(display_name, avatar_url)"
    );
    expect(queryBuilder.in).toHaveBeenCalledWith("activity_id", ["act-1", "act-2"]);
    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "approved");
    expect(queryBuilder.is).toHaveBeenCalledWith("cancelled_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("joined_at", { ascending: true });
  });

  it("groups rows by activity_id into a Map<activityId, ActivityParticipant[]>", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          activity_id: "act-1",
          user_id: "user-1",
          user: { display_name: "Alice", avatar_url: "https://img.example.com/alice.jpg" }
        },
        { activity_id: "act-1", user_id: "user-2", user: { display_name: "Bob", avatar_url: null } },
        { activity_id: "act-2", user_id: "user-3", user: { display_name: "Carol", avatar_url: null } }
      ],
      error: null
    });

    const result = await listActivityParticipantPreviews(["act-1", "act-2"]);

    expect(result.get("act-1")).toEqual([
      { userId: "user-1", displayName: "Alice", avatarUrl: "https://img.example.com/alice.jpg" },
      { userId: "user-2", displayName: "Bob", avatarUrl: null }
    ]);
    expect(result.get("act-2")).toEqual([
      { userId: "user-3", displayName: "Carol", avatarUrl: null }
    ]);
    // 没有任何参与者的活动 id 不应该出现在 Map 里（不是空数组占位）。
    expect(result.has("act-3")).toBe(false);
  });

  it("falls back to a placeholder display name and a null avatarUrl when the joined profile is missing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [{ activity_id: "act-1", user_id: "user-1", user: null }],
      error: null
    });

    const result = await listActivityParticipantPreviews(["act-1"]);

    expect(result.get("act-1")).toEqual([{ userId: "user-1", displayName: "未知用户", avatarUrl: null }]);
  });

  it("returns an empty map without throwing when none of the given activities have any approved participants", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listActivityParticipantPreviews(["act-1"])).resolves.toEqual(new Map());
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listActivityParticipantPreviews(["act-1"])).rejects.toMatchObject({
      code: "ACTIVITY_PARTICIPANT_PREVIEWS_LIST_FAILED"
    });
  });
});

describe("listMyOrganizedActivities", () => {
  beforeEach(resetAllMocks);

  it("filters to organizer_id = the given user, no status filter, ordered by start_at ascending (matching listActivities)", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listMyOrganizedActivities("user-1");

    expect(fromMock).toHaveBeenCalledWith("activities");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, organizer_id, channel, tag_text, title, location:locations(name), landmark_text, is_online, start_at, capacity, participant_count, status, requires_approval, organizer:profiles(display_name, avatar_url)"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("organizer_id", "user-1");
    expect(queryBuilder.in).not.toHaveBeenCalled();
    expect(queryBuilder.gte).not.toHaveBeenCalled();
    expect(queryBuilder.order).toHaveBeenCalledWith("start_at", { ascending: true });
  });

  it("maps rows to ActivityListItem (same shape as listActivities), including organizerId/organizerDisplayName/requiresApproval", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "act-1",
          organizer_id: "user-1",
          channel: "food",
          tag_text: "火锅",
          title: "周末吃火锅",
          location: { name: "Rockville" },
          landmark_text: "海底捞",
          is_online: false,
          start_at: "2026-08-20T18:00:00.000Z",
          capacity: 4,
          participant_count: 2,
          status: "cancelled",
          requires_approval: true,
          organizer: { display_name: "Alice", avatar_url: null }
        }
      ],
      error: null
    });

    const result = await listMyOrganizedActivities("user-1");

    expect(result).toEqual([
      {
        id: "act-1",
        organizerId: "user-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        channel: "food",
        tagText: "火锅",
        title: "周末吃火锅",
        locationName: "Rockville",
        landmarkText: "海底捞",
        isOnline: false,
        startAt: "2026-08-20T18:00:00.000Z",
        capacity: 4,
        participantCount: 2,
        status: "cancelled",
        requiresApproval: true
      }
    ]);
  });

  it("returns an empty list without throwing when the user has never organized an activity", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listMyOrganizedActivities("user-1")).resolves.toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listMyOrganizedActivities("user-1")).rejects.toMatchObject({
      code: "MY_ORGANIZED_ACTIVITIES_LIST_FAILED"
    });
  });
});

describe("listMyJoinedActivities", () => {
  beforeEach(resetAllMocks);

  it("queries activity_participants for non-cancelled, non-rejected rows of the given user, with status + nested activities select, ordered by joined_at descending", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listMyJoinedActivities("user-1");

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "status, activity:activities(id, organizer_id, channel, tag_text, title, location:locations(name), landmark_text, is_online, start_at, capacity, participant_count, status, requires_approval, organizer:profiles(display_name, avatar_url))"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(queryBuilder.is).toHaveBeenCalledWith("cancelled_at", null);
    expect(queryBuilder.neq).toHaveBeenCalledWith("status", "rejected");
    expect(queryBuilder.order).toHaveBeenCalledWith("joined_at", { ascending: false });
  });

  it("maps the nested activity of each row to MyJoinedActivityItem (including organizerId + participationStatus), including one whose activity status is 'cancelled' (the whole point of the new RLS policy)", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          status: "approved",
          activity: {
            id: "act-1",
            organizer_id: "organizer-1",
            channel: "food",
            tag_text: null,
            title: "已被取消的活动",
            location: null,
            landmark_text: null,
            is_online: true,
            start_at: "2026-08-20T18:00:00.000Z",
            capacity: null,
            participant_count: 0,
            status: "cancelled",
            requires_approval: false,
            organizer: { display_name: "Organizer", avatar_url: null }
          }
        }
      ],
      error: null
    });

    const result = await listMyJoinedActivities("user-1");

    expect(result).toEqual([
      {
        id: "act-1",
        organizerId: "organizer-1",
        organizerDisplayName: "Organizer",
        organizerAvatarUrl: null,
        channel: "food",
        tagText: null,
        title: "已被取消的活动",
        locationName: null,
        landmarkText: null,
        isOnline: true,
        startAt: "2026-08-20T18:00:00.000Z",
        capacity: null,
        participantCount: 0,
        status: "cancelled",
        requiresApproval: false,
        participationStatus: "approved"
      }
    ]);
  });

  it("maps a pending row's participationStatus as 'pending'", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          status: "pending",
          activity: {
            id: "act-1",
            organizer_id: "organizer-1",
            channel: "food",
            tag_text: null,
            title: "需要审核的活动",
            location: null,
            landmark_text: null,
            is_online: true,
            start_at: "2026-08-20T18:00:00.000Z",
            capacity: null,
            participant_count: 0,
            status: "open",
            requires_approval: true,
            organizer: null
          }
        }
      ],
      error: null
    });

    const result = await listMyJoinedActivities("user-1");

    expect(result[0].participationStatus).toBe("pending");
  });

  it("filters out rows whose nested activity is null, without throwing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [{ status: "approved", activity: null }],
      error: null
    });

    await expect(listMyJoinedActivities("user-1")).resolves.toEqual([]);
  });

  it("returns an empty list without throwing when the user has never joined an activity", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listMyJoinedActivities("user-1")).resolves.toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listMyJoinedActivities("user-1")).rejects.toMatchObject({
      code: "MY_JOINED_ACTIVITIES_LIST_FAILED"
    });
  });
});

describe("cancelActivity", () => {
  beforeEach(resetAllMocks);

  it("updates status to 'cancelled' for the given activity id", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "act-1" }, error: null });

    await cancelActivity("act-1");

    expect(fromMock).toHaveBeenCalledWith("activities");
    expect(queryBuilder.update).toHaveBeenCalledWith({ status: "cancelled" });
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "act-1");
  });

  it("throws an AppError when the update fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "update failed", code: "500" }
    });

    await expect(cancelActivity("act-1")).rejects.toMatchObject({
      code: "ACTIVITY_CANCEL_FAILED"
    });
  });

  it("throws a not-found/forbidden AppError when no row was affected (not the organizer, or activity doesn't exist)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(cancelActivity("act-1")).rejects.toMatchObject({
      code: "ACTIVITY_CANCEL_NOT_FOUND"
    });
  });
});

describe("listPendingActivityParticipants", () => {
  beforeEach(resetAllMocks);

  it("returns an empty list without querying at all when given an empty array of activity ids", async () => {
    const result = await listPendingActivityParticipants([]);

    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("queries pending participants across the given activity ids, ordered by joined_at ascending, with a nested profile select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listPendingActivityParticipants(["act-1", "act-2"]);

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, activity_id, user_id, user:profiles(display_name)"
    );
    expect(queryBuilder.in).toHaveBeenCalledWith("activity_id", ["act-1", "act-2"]);
    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "pending");
    expect(queryBuilder.order).toHaveBeenCalledWith("joined_at", { ascending: true });
  });

  it("maps rows to PendingActivityParticipant, including which activity each applicant belongs to", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "participant-1",
          activity_id: "act-1",
          user_id: "user-1",
          user: { display_name: "Alice" }
        }
      ],
      error: null
    });

    const result = await listPendingActivityParticipants(["act-1"]);

    expect(result).toEqual([
      {
        participantId: "participant-1",
        activityId: "act-1",
        userId: "user-1",
        displayName: "Alice"
      }
    ]);
  });

  it("falls back to a placeholder display name when the joined profile is missing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [{ id: "participant-1", activity_id: "act-1", user_id: "user-1", user: null }],
      error: null
    });

    const result = await listPendingActivityParticipants(["act-1"]);

    expect(result[0].displayName).toBe("未知用户");
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listPendingActivityParticipants(["act-1"])).rejects.toMatchObject({
      code: "ACTIVITY_PENDING_PARTICIPANTS_LIST_FAILED"
    });
  });
});

// 30 号卡（待审核红点）：底部导航"我的"图标用这个函数判断要不要显示红点，
// 见 use-has-pending-activity-participants-query.ts。
describe("hasPendingActivityParticipantsForOrganizer", () => {
  beforeEach(resetAllMocks);

  it("queries activity_participants filtered to pending status and the given organizer, with count:'exact', head:true", async () => {
    thenMock.mockResolvedValue({ count: 0, data: null, error: null });

    await hasPendingActivityParticipantsForOrganizer("organizer-1");

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    expect(queryBuilder.select).toHaveBeenCalledWith("id, activities!inner(organizer_id)", {
      count: "exact",
      head: true
    });
    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "pending");
    expect(queryBuilder.eq).toHaveBeenCalledWith("activities.organizer_id", "organizer-1");
  });

  it("returns true when count is greater than 0", async () => {
    thenMock.mockResolvedValue({ count: 3, data: null, error: null });

    await expect(hasPendingActivityParticipantsForOrganizer("organizer-1")).resolves.toBe(true);
  });

  it("returns false when count is 0", async () => {
    thenMock.mockResolvedValue({ count: 0, data: null, error: null });

    await expect(hasPendingActivityParticipantsForOrganizer("organizer-1")).resolves.toBe(false);
  });

  it("returns false (not throw) when count comes back null", async () => {
    thenMock.mockResolvedValue({ count: null, data: null, error: null });

    await expect(hasPendingActivityParticipantsForOrganizer("organizer-1")).resolves.toBe(false);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    thenMock.mockResolvedValue({
      count: null,
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(hasPendingActivityParticipantsForOrganizer("organizer-1")).rejects.toMatchObject({
      code: "ACTIVITY_PENDING_PARTICIPANTS_COUNT_FAILED"
    });
  });
});

describe("approveActivityParticipant", () => {
  beforeEach(resetAllMocks);

  it("calls the approve_activity_participant RPC with the given participant id", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await approveActivityParticipant("participant-1");

    expect(rpcMock).toHaveBeenCalledWith("approve_activity_participant", {
      target_participant_id: "participant-1"
    });
  });

  it("throws an AppError when the RPC fails (e.g. not the organizer, or not pending)", async () => {
    rpcMock.mockResolvedValue({
      error: { message: "only the activity organizer can approve participants" }
    });

    await expect(approveActivityParticipant("participant-1")).rejects.toMatchObject({
      code: "ACTIVITY_PARTICIPANT_APPROVE_FAILED"
    });
  });
});

describe("rejectActivityParticipant", () => {
  beforeEach(resetAllMocks);

  it("calls the reject_activity_participant RPC with the given participant id", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await rejectActivityParticipant("participant-1");

    expect(rpcMock).toHaveBeenCalledWith("reject_activity_participant", {
      target_participant_id: "participant-1"
    });
  });

  it("throws an AppError when the RPC fails (e.g. not the organizer, or not pending)", async () => {
    rpcMock.mockResolvedValue({
      error: { message: "participant is not pending" }
    });

    await expect(rejectActivityParticipant("participant-1")).rejects.toMatchObject({
      code: "ACTIVITY_PARTICIPANT_REJECT_FAILED"
    });
  });
});

describe("notifyActivityParticipants", () => {
  beforeEach(resetAllMocks);

  it("calls the notify_activity_participants RPC with the activity id and body", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await notifyActivityParticipants("act-1", "下周六改到下午两点");

    expect(rpcMock).toHaveBeenCalledWith("notify_activity_participants", {
      target_activity_id: "act-1",
      body: "下周六改到下午两点"
    });
  });

  it("throws an AppError when the RPC fails (e.g. not the organizer, or empty body)", async () => {
    rpcMock.mockResolvedValue({
      error: { message: "only the activity organizer can notify participants" }
    });

    await expect(notifyActivityParticipants("act-1", "内容")).rejects.toMatchObject({
      code: "ACTIVITY_NOTIFY_PARTICIPANTS_FAILED"
    });
  });
});

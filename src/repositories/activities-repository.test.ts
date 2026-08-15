import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, overrideTypesMock, singleMock, maybeSingleMock } = vi.hoisted(() => {
  const overrideTypesMock = vi.fn();
  const singleMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "eq", "is", "in", "gte", "order", "insert", "update"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.overrideTypes = overrideTypesMock;
  builder.single = singleMock;
  builder.maybeSingle = maybeSingleMock;
  return { queryBuilder: builder, overrideTypesMock, singleMock, maybeSingleMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import {
  createActivity,
  getActivityDetail,
  isCurrentlyJoined,
  joinActivity,
  leaveActivity,
  listActivities,
  listActivityParticipants
} from "./activities-repository";

function resetAllMocks(): void {
  fromMock.mockClear();
  for (const key of Object.keys(queryBuilder)) {
    queryBuilder[key].mockClear();
  }
  overrideTypesMock.mockReset();
  singleMock.mockReset();
  maybeSingleMock.mockReset();
}

describe("listActivities", () => {
  beforeEach(resetAllMocks);

  it("filters to open/full status with start_at in the future, ordered by start_at ascending, with a nested location select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listActivities();

    expect(fromMock).toHaveBeenCalledWith("activities");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, channel, tag_text, title, location:locations(name), landmark_text, is_online, start_at, capacity, participant_count, status"
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

  it("also filters by locationId when provided", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listActivities({ locationId: "loc-1" });

    expect(queryBuilder.eq).toHaveBeenCalledWith("location_id", "loc-1");
  });

  it("maps rows to ActivityListItem, resolving the joined location name", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "act-1",
          channel: "food",
          tag_text: "火锅",
          title: "周末吃火锅",
          location: { name: "Rockville" },
          landmark_text: "海底捞",
          is_online: false,
          start_at: "2026-08-20T18:00:00.000Z",
          capacity: 4,
          participant_count: 2,
          status: "open"
        }
      ],
      error: null
    });

    const result = await listActivities();

    expect(result).toEqual([
      {
        id: "act-1",
        channel: "food",
        tagText: "火锅",
        title: "周末吃火锅",
        locationName: "Rockville",
        landmarkText: "海底捞",
        isOnline: false,
        startAt: "2026-08-20T18:00:00.000Z",
        capacity: 4,
        participantCount: 2,
        status: "open"
      }
    ]);
  });

  it("resolves locationName to null when there is no joined location (e.g. an online activity)", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "act-1",
          channel: "game",
          tag_text: null,
          title: "线上开黑",
          location: null,
          landmark_text: null,
          is_online: true,
          start_at: "2026-08-20T18:00:00.000Z",
          capacity: null,
          participant_count: 1,
          status: "open"
        }
      ],
      error: null
    });

    const result = await listActivities();

    expect(result[0].locationName).toBeNull();
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
      "id, organizer_id, channel, tag_text, title, description, location_id, landmark_text, is_online, start_at, capacity, participant_count, contact_method, contact_value, status, location:locations(name), organizer:profiles(display_name)"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "act-1");
    expect(queryBuilder.eq).not.toHaveBeenCalledWith("status", expect.anything());
    expect(queryBuilder.is).not.toHaveBeenCalled();
  });

  it("maps a full row to ActivityDetail", async () => {
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
        location: { name: "Rockville" },
        organizer: { display_name: "Alice" }
      },
      error: null
    });

    const result = await getActivityDetail("act-1");

    expect(result).toEqual({
      id: "act-1",
      organizerId: "user-1",
      organizerDisplayName: "Alice",
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
      status: "open"
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
        location: null,
        organizer: null
      },
      error: null
    });

    const result = await getActivityDetail("act-1");

    expect(result?.organizerDisplayName).toBe("未知用户");
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
    contactValue: "abc123"
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
      contact_value: "abc123"
    });
    const insertedPayload = queryBuilder.insert.mock.calls[0][0];
    expect(insertedPayload).not.toHaveProperty("status");
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(result).toEqual({ id: "act-1" });
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

describe("isCurrentlyJoined", () => {
  beforeEach(resetAllMocks);

  it("queries for a non-cancelled participation row matching activity and user", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "row-1" }, error: null });

    await isCurrentlyJoined("act-1", "user-1");

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(queryBuilder.eq).toHaveBeenCalledWith("activity_id", "act-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(queryBuilder.is).toHaveBeenCalledWith("cancelled_at", null);
  });

  it("returns true when a matching row is found", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "row-1" }, error: null });

    await expect(isCurrentlyJoined("act-1", "user-1")).resolves.toBe(true);
  });

  it("returns false when no matching row is found", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(isCurrentlyJoined("act-1", "user-1")).resolves.toBe(false);
  });

  it("throws an AppError when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(isCurrentlyJoined("act-1", "user-1")).rejects.toMatchObject({
      code: "ACTIVITY_PARTICIPATION_CHECK_FAILED"
    });
  });
});

describe("joinActivity", () => {
  beforeEach(resetAllMocks);

  it("inserts a fresh participation row and returns on success (first-time join)", async () => {
    queryBuilder.insert.mockResolvedValueOnce({ error: null });

    await joinActivity("act-1", "user-1");

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    expect(queryBuilder.insert).toHaveBeenCalledWith({
      activity_id: "act-1",
      user_id: "user-1"
    });
    // 第一次 insert 就成功时，不应该再走 update 分支。
    expect(queryBuilder.update).not.toHaveBeenCalled();
  });

  it("on a unique-violation (23505), re-joins by updating cancelled_at back to null", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: { message: "duplicate key", code: "23505" }
    });
    maybeSingleMock.mockResolvedValue({ data: { id: "row-1" }, error: null });

    await joinActivity("act-1", "user-1");

    expect(queryBuilder.update).toHaveBeenCalledWith({ cancelled_at: null });
    expect(queryBuilder.eq).toHaveBeenCalledWith("activity_id", "act-1");
    expect(queryBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("treats a no-op update after a 23505 (row already re-joined, e.g. by a concurrent request) as success", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: { message: "duplicate key", code: "23505" }
    });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(joinActivity("act-1", "user-1")).resolves.toBeUndefined();
  });

  it("throws ACTIVITY_JOIN_FAILED when the re-join update itself fails", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: { message: "duplicate key", code: "23505" }
    });
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "update failed", code: "500" }
    });

    await expect(joinActivity("act-1", "user-1")).rejects.toMatchObject({
      code: "ACTIVITY_JOIN_FAILED"
    });
  });

  it("throws a generic ACTIVITY_JOIN_FORBIDDEN AppError (not ACCOUNT_RESTRICTED) on an RLS violation (42501), since multiple causes are possible", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: {
        message: "new row violates row-level security policy for table \"activity_participants\"",
        code: "42501"
      }
    });

    await expect(joinActivity("act-1", "user-1")).rejects.toMatchObject({
      code: "ACTIVITY_JOIN_FORBIDDEN"
    });
  });

  it("throws a generic ACTIVITY_JOIN_FAILED AppError for any other insert error", async () => {
    queryBuilder.insert.mockResolvedValueOnce({
      error: { message: "network down", code: "500" }
    });

    await expect(joinActivity("act-1", "user-1")).rejects.toMatchObject({
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

  it("queries non-cancelled participants for the activity, ordered by joined_at ascending, with a nested profile select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listActivityParticipants("act-1");

    expect(fromMock).toHaveBeenCalledWith("activity_participants");
    expect(queryBuilder.select).toHaveBeenCalledWith("user_id, user:profiles(display_name)");
    expect(queryBuilder.eq).toHaveBeenCalledWith("activity_id", "act-1");
    expect(queryBuilder.is).toHaveBeenCalledWith("cancelled_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("joined_at", { ascending: true });
  });

  it("maps rows to ActivityParticipant", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        { user_id: "user-1", user: { display_name: "Alice" } },
        { user_id: "user-2", user: { display_name: "Bob" } }
      ],
      error: null
    });

    const result = await listActivityParticipants("act-1");

    expect(result).toEqual([
      { userId: "user-1", displayName: "Alice" },
      { userId: "user-2", displayName: "Bob" }
    ]);
  });

  it("falls back to a placeholder display name when the joined profile is missing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [{ user_id: "user-1", user: null }],
      error: null
    });

    const result = await listActivityParticipants("act-1");

    expect(result[0].displayName).toBe("未知用户");
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

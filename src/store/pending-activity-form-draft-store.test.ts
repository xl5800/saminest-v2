import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePendingActivityFormDraftStore } from "./pending-activity-form-draft-store";

const initialState = usePendingActivityFormDraftStore.getState();

beforeEach(() => {
  usePendingActivityFormDraftStore.setState(initialState, true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleDraft = {
  channel: "food",
  tagText: "火锅",
  title: "周末吃火锅",
  description: "一起吃火锅，AA制",
  isOnline: false,
  landmarkText: "海底捞",
  startAt: "2099-01-01T10:00",
  capacity: "4",
  contactMethod: "wechat",
  contactValue: "abc123",
  requiresApproval: true
};

describe("usePendingActivityFormDraftStore", () => {
  it("starts with no pending draft", () => {
    expect(usePendingActivityFormDraftStore.getState().getFreshDraft()).toBeNull();
  });

  it("saveDraft + getFreshDraft round-trips the full snapshot", () => {
    usePendingActivityFormDraftStore.getState().saveDraft(sampleDraft);

    expect(usePendingActivityFormDraftStore.getState().getFreshDraft()).toEqual(sampleDraft);
  });

  it("clearDraft resets it back to null", () => {
    usePendingActivityFormDraftStore.getState().saveDraft(sampleDraft);

    usePendingActivityFormDraftStore.getState().clearDraft();

    expect(usePendingActivityFormDraftStore.getState().getFreshDraft()).toBeNull();
  });

  // 不用 persist 中间件——只是页面间一次性交接数据，不应该在 localStorage
  // 里留一份，见 store 顶部注释。
  it("does not persist to localStorage", () => {
    usePendingActivityFormDraftStore.getState().saveDraft(sampleDraft);

    expect(localStorage.getItem("saminest-pending-activity-form-draft")).toBeNull();
  });

  // 时效保险：正常的"选州→返回"来回是几秒钟的事，5 分钟绰绰有余；超过
  // 这个窗口就当没有草稿处理，给"半途而废没走完整个来回"这种情况兜底，
  // 见 store 顶部 MAX_DRAFT_AGE_MS 的注释。
  describe("getFreshDraft 时效检查", () => {
    it("still returns the draft when read well within the 5-minute window", () => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      usePendingActivityFormDraftStore.getState().saveDraft(sampleDraft);

      vi.spyOn(Date, "now").mockReturnValue(1_000_000 + 4 * 60 * 1000);

      expect(usePendingActivityFormDraftStore.getState().getFreshDraft()).toEqual(sampleDraft);
    });

    it("returns null once the draft is older than 5 minutes, without un-expiring it later", () => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      usePendingActivityFormDraftStore.getState().saveDraft(sampleDraft);

      vi.spyOn(Date, "now").mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);

      expect(usePendingActivityFormDraftStore.getState().getFreshDraft()).toBeNull();
    });

    it("does not leak the internal savedAt timestamp into the returned draft", () => {
      usePendingActivityFormDraftStore.getState().saveDraft(sampleDraft);

      const fresh = usePendingActivityFormDraftStore.getState().getFreshDraft();

      expect(fresh).not.toHaveProperty("savedAt");
    });
  });
});

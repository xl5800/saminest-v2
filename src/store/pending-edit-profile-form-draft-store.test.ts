import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePendingEditProfileFormDraftStore } from "./pending-edit-profile-form-draft-store";

const initialState = usePendingEditProfileFormDraftStore.getState();

beforeEach(() => {
  usePendingEditProfileFormDraftStore.setState(initialState, true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleDraft = {
  displayName: "小明",
  bio: "热爱生活",
  age: "25"
};

describe("usePendingEditProfileFormDraftStore", () => {
  it("starts with no pending draft", () => {
    expect(usePendingEditProfileFormDraftStore.getState().getFreshDraft()).toBeNull();
  });

  it("saveDraft + getFreshDraft round-trips the full snapshot", () => {
    usePendingEditProfileFormDraftStore.getState().saveDraft(sampleDraft);

    expect(usePendingEditProfileFormDraftStore.getState().getFreshDraft()).toEqual(sampleDraft);
  });

  it("clearDraft resets it back to null", () => {
    usePendingEditProfileFormDraftStore.getState().saveDraft(sampleDraft);

    usePendingEditProfileFormDraftStore.getState().clearDraft();

    expect(usePendingEditProfileFormDraftStore.getState().getFreshDraft()).toBeNull();
  });

  // 不用 persist 中间件——只是页面间一次性交接数据，不应该在 localStorage
  // 里留一份，见 store 顶部注释。
  it("does not persist to localStorage", () => {
    usePendingEditProfileFormDraftStore.getState().saveDraft(sampleDraft);

    expect(localStorage.getItem("saminest-pending-edit-profile-form-draft")).toBeNull();
  });

  // 时效保险：跟 pending-post-form-draft-store.test.ts /
  // pending-activity-form-draft-store.test.ts 是同一组断言，见那边
  // MAX_DRAFT_AGE_MS 的注释。
  describe("getFreshDraft 时效检查", () => {
    it("still returns the draft when read well within the 5-minute window", () => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      usePendingEditProfileFormDraftStore.getState().saveDraft(sampleDraft);

      vi.spyOn(Date, "now").mockReturnValue(1_000_000 + 4 * 60 * 1000);

      expect(usePendingEditProfileFormDraftStore.getState().getFreshDraft()).toEqual(sampleDraft);
    });

    it("returns null once the draft is older than 5 minutes, without un-expiring it later", () => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      usePendingEditProfileFormDraftStore.getState().saveDraft(sampleDraft);

      vi.spyOn(Date, "now").mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);

      expect(usePendingEditProfileFormDraftStore.getState().getFreshDraft()).toBeNull();
    });

    it("does not leak the internal savedAt timestamp into the returned draft", () => {
      usePendingEditProfileFormDraftStore.getState().saveDraft(sampleDraft);

      const fresh = usePendingEditProfileFormDraftStore.getState().getFreshDraft();

      expect(fresh).not.toHaveProperty("savedAt");
    });
  });
});

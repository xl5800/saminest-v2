import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePendingPostFormDraftStore } from "./pending-post-form-draft-store";

const initialState = usePendingPostFormDraftStore.getState();

beforeEach(() => {
  usePendingPostFormDraftStore.setState(initialState, true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleFile = new File(["fake"], "photo.jpg", { type: "image/jpeg" });

const sampleDraft = {
  categoryId: "cat-1",
  title: "Sunny room",
  description: "Nice and quiet.",
  price: "1200",
  contactMethod: "email",
  contactValue: "alice@example.com",
  images: [sampleFile],
  existingImages: []
};

describe("usePendingPostFormDraftStore", () => {
  it("starts with no pending draft", () => {
    expect(usePendingPostFormDraftStore.getState().getFreshDraft()).toBeNull();
  });

  it("saveDraft + getFreshDraft round-trips the full snapshot, including in-memory File objects", () => {
    usePendingPostFormDraftStore.getState().saveDraft(sampleDraft);

    const fresh = usePendingPostFormDraftStore.getState().getFreshDraft();
    expect(fresh).toEqual(sampleDraft);
    expect(fresh?.images[0]).toBeInstanceOf(File);
  });

  it("clearDraft resets it back to null", () => {
    usePendingPostFormDraftStore.getState().saveDraft(sampleDraft);

    usePendingPostFormDraftStore.getState().clearDraft();

    expect(usePendingPostFormDraftStore.getState().getFreshDraft()).toBeNull();
  });

  // 不用 persist 中间件——只是页面间一次性交接数据，不应该在 localStorage
  // 里留一份，见 store 顶部注释；images 是 File 对象，本来也没法被
  // JSON 序列化进 localStorage。
  it("does not persist to localStorage", () => {
    usePendingPostFormDraftStore.getState().saveDraft(sampleDraft);

    expect(localStorage.getItem("saminest-pending-post-form-draft")).toBeNull();
  });

  // 时效保险：跟 pending-activity-form-draft-store.test.ts 是同一组断言，
  // 见那边 MAX_DRAFT_AGE_MS 的注释。
  describe("getFreshDraft 时效检查", () => {
    it("still returns the draft when read well within the 5-minute window", () => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      usePendingPostFormDraftStore.getState().saveDraft(sampleDraft);

      vi.spyOn(Date, "now").mockReturnValue(1_000_000 + 4 * 60 * 1000);

      expect(usePendingPostFormDraftStore.getState().getFreshDraft()).toEqual(sampleDraft);
    });

    it("returns null once the draft is older than 5 minutes, without un-expiring it later", () => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      usePendingPostFormDraftStore.getState().saveDraft(sampleDraft);

      vi.spyOn(Date, "now").mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);

      expect(usePendingPostFormDraftStore.getState().getFreshDraft()).toBeNull();
    });

    it("does not leak the internal savedAt timestamp into the returned draft", () => {
      usePendingPostFormDraftStore.getState().saveDraft(sampleDraft);

      const fresh = usePendingPostFormDraftStore.getState().getFreshDraft();

      expect(fresh).not.toHaveProperty("savedAt");
    });
  });
});

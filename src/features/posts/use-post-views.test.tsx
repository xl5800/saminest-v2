import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordPostView } = vi.hoisted(() => ({ recordPostView: vi.fn() }));

vi.mock("../../repositories/posts-repository", () => ({
  recordPostView,
  getPostViewCount: vi.fn()
}));

import { useRecordPostView } from "./use-post-views";

describe("useRecordPostView", () => {
  beforeEach(() => {
    recordPostView.mockReset();
    recordPostView.mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("records one view per post per day on this device", () => {
    renderHook(() => useRecordPostView("post-1", true));
    expect(recordPostView).toHaveBeenCalledWith("post-1");

    renderHook(() => useRecordPostView("post-1", true));
    expect(recordPostView).toHaveBeenCalledTimes(1);

    renderHook(() => useRecordPostView("post-2", true));
    expect(recordPostView).toHaveBeenCalledTimes(2);
  });

  it("does not record when disabled (e.g. the author viewing their own post)", () => {
    renderHook(() => useRecordPostView("post-1", false));
    renderHook(() => useRecordPostView(undefined, true));

    expect(recordPostView).not.toHaveBeenCalled();
  });
});

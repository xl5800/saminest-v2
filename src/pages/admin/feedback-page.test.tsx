import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listFeedbackForAdmin, setFeedbackStatus } = vi.hoisted(() => ({
  listFeedbackForAdmin: vi.fn(),
  setFeedbackStatus: vi.fn()
}));

vi.mock("../../repositories/feedback-repository", async () => {
  const actual = await vi.importActual<typeof import("../../repositories/feedback-repository")>(
    "../../repositories/feedback-repository"
  );
  return {
    ...actual,
    listFeedbackForAdmin,
    setFeedbackStatus
  };
});

import { renderWithProviders } from "../../test/render-with-providers";
import { AdminFeedbackPage } from "./feedback-page";

const sampleFeedback = {
  id: "feedback-1",
  type: "bug",
  title: "首页图片加载失败",
  content: "封面图一直显示占位图，详情页正常。",
  status: "pending",
  createdAt: "2026-08-01T00:00:00.000Z",
  submitterName: "Alice",
  images: []
};

describe("AdminFeedbackPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listFeedbackForAdmin.mockReset();
    setFeedbackStatus.mockReset();
  });

  it("shows the '联系客服' heading and AdminNav", async () => {
    listFeedbackForAdmin.mockResolvedValue([]);

    renderWithProviders(<AdminFeedbackPage />);

    expect(await screen.findByRole("heading", { name: "联系客服" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "管理后台导航" })).toBeInTheDocument();
  });

  it("shows an empty state when there is no feedback", async () => {
    listFeedbackForAdmin.mockResolvedValue([]);

    renderWithProviders(<AdminFeedbackPage />);

    expect(await screen.findByText("暂无反馈")).toBeInTheDocument();
  });

  it("renders each feedback item with its type label, title, content, submitter, and date", async () => {
    listFeedbackForAdmin.mockResolvedValue([sampleFeedback]);

    renderWithProviders(<AdminFeedbackPage />);

    const item = await screen.findByText("首页图片加载失败");
    const row = item.closest("li");
    expect(row).toHaveTextContent("问题反馈");
    expect(row).toHaveTextContent("封面图一直显示占位图，详情页正常。");
    expect(row).toHaveTextContent("Alice");
  });

  it("renders a thumbnail <img> for each attached screenshot", async () => {
    listFeedbackForAdmin.mockResolvedValue([
      {
        ...sampleFeedback,
        images: [{ id: "img-1", publicUrl: "https://example.com/1.webp" }]
      }
    ]);

    renderWithProviders(<AdminFeedbackPage />);

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/1.webp");
  });

  it("does not render any <img> when there are no screenshots", async () => {
    listFeedbackForAdmin.mockResolvedValue([sampleFeedback]);

    renderWithProviders(<AdminFeedbackPage />);

    await screen.findByText("首页图片加载失败");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("defaults the status filter to pending and requests pending feedback", async () => {
    listFeedbackForAdmin.mockResolvedValue([]);

    renderWithProviders(<AdminFeedbackPage />);

    await waitFor(() => {
      expect(listFeedbackForAdmin).toHaveBeenCalledWith("pending");
    });
    expect(screen.getByLabelText("状态")).toHaveValue("pending");
  });

  it("re-queries with the new status when the filter changes", async () => {
    listFeedbackForAdmin.mockResolvedValue([]);

    renderWithProviders(<AdminFeedbackPage />);
    await waitFor(() => {
      expect(listFeedbackForAdmin).toHaveBeenCalledWith("pending");
    });

    fireEvent.change(screen.getByLabelText("状态"), { target: { value: "resolved" } });

    await waitFor(() => {
      expect(listFeedbackForAdmin).toHaveBeenCalledWith("resolved");
    });
  });

  // 一步到位：点按钮直接调用 setFeedbackStatus，不像举报处理那样先展开
  // 一个表单填说明再确认——这次任务明确要求的简化交互。
  it("shows the other three status buttons for a pending row (标记处理中/标记已解决/标记已关闭)", async () => {
    listFeedbackForAdmin.mockResolvedValue([sampleFeedback]);

    renderWithProviders(<AdminFeedbackPage />);
    await screen.findByText("首页图片加载失败");

    expect(screen.getByRole("button", { name: "标记处理中" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标记已解决" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标记已关闭" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "标记待处理" })).not.toBeInTheDocument();
  });

  it("clicking a status button calls setFeedbackStatus directly and removes the row on success, with no intermediate form", async () => {
    listFeedbackForAdmin.mockResolvedValue([sampleFeedback]);
    setFeedbackStatus.mockResolvedValue(undefined);

    renderWithProviders(<AdminFeedbackPage />);
    await screen.findByText("首页图片加载失败");

    fireEvent.click(screen.getByRole("button", { name: "标记已解决" }));

    await waitFor(() => {
      expect(setFeedbackStatus).toHaveBeenCalledWith("feedback-1", "resolved");
    });
    await waitFor(() => {
      expect(screen.queryByText("首页图片加载失败")).not.toBeInTheDocument();
    });
  });

  it("shows a generic error message and keeps the row when setFeedbackStatus fails", async () => {
    listFeedbackForAdmin.mockResolvedValue([sampleFeedback]);
    setFeedbackStatus.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminFeedbackPage />);
    await screen.findByText("首页图片加载失败");

    fireEvent.click(screen.getByRole("button", { name: "标记已解决" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
    expect(screen.getByText("首页图片加载失败")).toBeInTheDocument();
  });

  it("shows a loading message while the query is pending", () => {
    listFeedbackForAdmin.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<AdminFeedbackPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an error message when the query fails", async () => {
    listFeedbackForAdmin.mockRejectedValue(new Error("network down"));

    renderWithProviders(<AdminFeedbackPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("反馈加载失败，请稍后重试。");
  });
});

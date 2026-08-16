import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listReportsForModeration, resolveReport, dismissReport, deletePost } =
  vi.hoisted(() => ({
    listReportsForModeration: vi.fn(),
    resolveReport: vi.fn(),
    dismissReport: vi.fn(),
    deletePost: vi.fn()
  }));

vi.mock("../../repositories/reports-repository", async () => {
  const actual = await vi.importActual<typeof import("../../repositories/reports-repository")>(
    "../../repositories/reports-repository"
  );
  return {
    ...actual,
    listReportsForModeration
  };
});
vi.mock("../../repositories/admin-repository", () => ({
  resolveReport,
  dismissReport,
  deletePost
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { AdminReportsPage } from "./reports-page";

const sampleReport = {
  id: "report-1",
  reasonCode: "spam",
  description: "看起来像广告",
  createdAt: "2026-07-01T00:00:00.000Z",
  targetType: "post",
  targetId: "post-1",
  reporterName: "Bob"
};

describe("AdminReportsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listReportsForModeration.mockReset();
    resolveReport.mockReset();
    dismissReport.mockReset();
    deletePost.mockReset();
  });

  it("shows an empty state when there are no reports", async () => {
    listReportsForModeration.mockResolvedValue([]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByText("暂无举报")).toBeInTheDocument();
  });

  it("renders each report with its reason label, reporter, target, and date", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);

    renderWithProviders(<AdminReportsPage />);

    const item = await screen.findByText("广告/垃圾信息");
    const row = item.closest("li");
    expect(row).toHaveTextContent("Bob");
    expect(row).toHaveTextContent("post / post-1");
  });

  it("renders the reporter's description text so admins can see what was reported", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByText("看起来像广告")).toBeInTheDocument();
  });

  it("shows a placeholder when the reporter left no description", async () => {
    listReportsForModeration.mockResolvedValue([{ ...sampleReport, description: null }]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByText("（举报人未填写补充说明）")).toBeInTheDocument();
  });

  it("renders the target as a clickable link to /post/:id when target_type is 'post'", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByRole("link", { name: "post / post-1" })).toHaveAttribute(
      "href",
      "/post/post-1"
    );
  });

  it("shows the target's title as the link text when it's available, instead of the raw id", async () => {
    listReportsForModeration.mockResolvedValue([
      { ...sampleReport, targetTitle: "全新沙发出售" }
    ]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByRole("link", { name: "全新沙发出售" })).toHaveAttribute(
      "href",
      "/post/post-1"
    );
  });

  it("renders the target as a clickable link to /activities/:id when target_type is 'activity' (P0 activity reporting)", async () => {
    const activityReport = {
      ...sampleReport,
      id: "report-activity-1",
      targetType: "activity",
      targetId: "act-1"
    };
    listReportsForModeration.mockResolvedValue([activityReport]);

    renderWithProviders(<AdminReportsPage />);

    expect(
      await screen.findByRole("link", { name: "activity / act-1" })
    ).toHaveAttribute("href", "/activities/act-1");
  });

  it("renders the target as plain (non-clickable) text for any other target_type", async () => {
    const commentReport = {
      ...sampleReport,
      id: "report-comment-1",
      targetType: "comment",
      targetId: "comment-1"
    };
    listReportsForModeration.mockResolvedValue([commentReport]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByText("comment / comment-1")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "comment / comment-1" })
    ).not.toBeInTheDocument();
  });

  it("defaults the status filter to pending and requests pending reports", async () => {
    listReportsForModeration.mockResolvedValue([]);

    renderWithProviders(<AdminReportsPage />);

    await waitFor(() => {
      expect(listReportsForModeration).toHaveBeenCalledWith("pending");
    });
    expect(screen.getByLabelText("状态")).toHaveValue("pending");
  });

  it("re-queries with the new status when the filter changes", async () => {
    listReportsForModeration.mockResolvedValue([]);

    renderWithProviders(<AdminReportsPage />);
    await waitFor(() => {
      expect(listReportsForModeration).toHaveBeenCalledWith("pending");
    });

    fireEvent.change(screen.getByLabelText("状态"), { target: { value: "resolved" } });

    await waitFor(() => {
      expect(listReportsForModeration).toHaveBeenCalledWith("resolved");
    });
  });

  it("shows a validation error and does not call resolveReport when confirming with an empty note", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请填写处理说明。");
    expect(resolveReport).not.toHaveBeenCalled();
  });

  it("calls resolveReport with the typed note and removes the row on success", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    resolveReport.mockResolvedValue(undefined);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "已核实并处理" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    await waitFor(() => {
      expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
    });
    expect(resolveReport).toHaveBeenCalledWith("report-1", "已核实并处理");
  });

  it("calls dismissReport with the typed note and removes the row on success", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    dismissReport.mockResolvedValue(undefined);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "驳回举报" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "举报不成立" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认驳回举报" }));

    await waitFor(() => {
      expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
    });
    expect(dismissReport).toHaveBeenCalledWith("report-1", "举报不成立");
  });

  it("keeps the row, shows an error, and preserves the typed note when resolveReport fails", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    resolveReport.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "已核实并处理" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByLabelText("处理说明")).toHaveValue("已核实并处理");
    expect(screen.getByText("广告/垃圾信息")).toBeInTheDocument();
  });

  it("keeps the row, shows an error, and preserves the typed note when dismissReport fails", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    dismissReport.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "驳回举报" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "举报不成立" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认驳回举报" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByLabelText("处理说明")).toHaveValue("举报不成立");
    expect(screen.getByText("广告/垃圾信息")).toBeInTheDocument();
  });

  it("shows the 同时删除该帖子 checkbox only for target_type === post rows", async () => {
    const nonPostReport = { ...sampleReport, id: "report-2", targetType: "listing" };
    listReportsForModeration.mockResolvedValue([sampleReport, nonPostReport]);

    renderWithProviders(<AdminReportsPage />);
    await screen.findAllByText("广告/垃圾信息");

    const buttons = screen.getAllByRole("button", { name: "标记已处理" });
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);
    expect(screen.getByText("同时删除该帖子")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(buttons[1]);
    expect(screen.queryByText("同时删除该帖子")).not.toBeInTheDocument();
  });

  it("reveals the delete-reason input when the checkbox is checked", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    expect(screen.queryByLabelText("删除原因")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("同时删除该帖子"));
    expect(screen.getByLabelText("删除原因")).toBeInTheDocument();
  });

  it("shows a validation error and calls neither RPC when the checkbox is checked but the delete reason is empty", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "已核实并处理" }
    });
    fireEvent.click(screen.getByLabelText("同时删除该帖子"));
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请填写删除原因。");
    expect(resolveReport).not.toHaveBeenCalled();
    expect(deletePost).not.toHaveBeenCalled();
  });

  it("calls both resolveReport and deletePost with correct args and removes the row on full success", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    resolveReport.mockResolvedValue(undefined);
    deletePost.mockResolvedValue(undefined);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "已核实并处理" }
    });
    fireEvent.click(screen.getByLabelText("同时删除该帖子"));
    fireEvent.change(screen.getByLabelText("删除原因"), {
      target: { value: "违反平台规则" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    await waitFor(() => {
      expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
    });
    expect(resolveReport).toHaveBeenCalledWith("report-1", "已核实并处理");
    expect(deletePost).toHaveBeenCalledWith("post-1", "违反平台规则");
  });

  it("removes the row and shows a distinct partial-failure message when resolveReport succeeds but deletePost fails", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    resolveReport.mockResolvedValue(undefined);
    deletePost.mockRejectedValue(new Error("delete failed"));

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "已核实并处理" }
    });
    fireEvent.click(screen.getByLabelText("同时删除该帖子"));
    fireEvent.change(screen.getByLabelText("删除原因"), {
      target: { value: "违反平台规则" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    await waitFor(() => {
      expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
    });
    expect(resolveReport).toHaveBeenCalledWith("report-1", "已核实并处理");
    expect(deletePost).toHaveBeenCalledWith("post-1", "违反平台规则");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "举报已处理，但删除帖子失败"
    );
  });

  it("does not call deletePost when the checkbox is left unchecked (regression check)", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    resolveReport.mockResolvedValue(undefined);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "已核实并处理" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    await waitFor(() => {
      expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
    });
    expect(resolveReport).toHaveBeenCalledWith("report-1", "已核实并处理");
    expect(deletePost).not.toHaveBeenCalled();
  });
});

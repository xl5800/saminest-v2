import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listCommunityRequestsForAdmin, adminApproveCommunity, adminRejectCommunity } = vi.hoisted(() => ({
  listCommunityRequestsForAdmin: vi.fn(),
  adminApproveCommunity: vi.fn(),
  adminRejectCommunity: vi.fn()
}));

vi.mock("../../repositories/community-repository", () => ({ listCommunityRequestsForAdmin }));
vi.mock("../../repositories/admin-repository", () => ({ adminApproveCommunity, adminRejectCommunity }));
// AdminNav 的角标会查待审核帖子 / 举报数量，这里给最小 mock，跟其它管理页测试一样。
vi.mock("../../repositories/posts-repository", () => ({ countPendingPosts: () => Promise.resolve(0) }));
vi.mock("../../repositories/reports-repository", () => ({ countPendingReports: () => Promise.resolve(0) }));

import { renderWithProviders } from "../../test/render-with-providers";
import { AdminCommunityRequestsPage } from "./community-requests-page";

const pendingRequest = {
  id: "c-9",
  name: "DMV 羽毛球",
  slug: "c-abc",
  description: "周末约球",
  stateCodes: ["VA", "MD"],
  status: "pending",
  rejectionReason: null,
  createdAt: "2026-10-10T00:00:00.000Z",
  creatorName: "一棵树"
};

describe("AdminCommunityRequestsPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    listCommunityRequestsForAdmin.mockReset();
    adminApproveCommunity.mockReset();
    adminRejectCommunity.mockReset();
    listCommunityRequestsForAdmin.mockResolvedValue([pendingRequest]);
  });

  it("defaults to pending requests and shows name, applicant, states and description", async () => {
    renderWithProviders(<AdminCommunityRequestsPage />);

    const name = await screen.findByText("DMV 羽毛球");
    const row = name.closest("li");
    expect(listCommunityRequestsForAdmin).toHaveBeenCalledWith("pending");
    expect(row).toHaveTextContent("一棵树");
    expect(row).toHaveTextContent("VA / MD");
    expect(row).toHaveTextContent("周末约球");
    expect(screen.getByRole("button", { name: "待审核" })).toHaveAttribute("aria-pressed", "true");
  });

  it("approves a request", async () => {
    adminApproveCommunity.mockResolvedValue(undefined);
    renderWithProviders(<AdminCommunityRequestsPage />);
    await screen.findByText("DMV 羽毛球");

    fireEvent.click(screen.getByRole("button", { name: "通过" }));

    await waitFor(() => expect(adminApproveCommunity).toHaveBeenCalledWith("c-9"));
  });

  it("rejects a request only with a reason", async () => {
    adminRejectCommunity.mockResolvedValue(undefined);
    renderWithProviders(<AdminCommunityRequestsPage />);
    await screen.findByText("DMV 羽毛球");

    fireEvent.click(screen.getByRole("button", { name: "驳回" }));
    fireEvent.click(screen.getByRole("button", { name: "确认驳回" }));
    expect(await screen.findByText("请填写驳回原因。")).toBeInTheDocument();
    expect(adminRejectCommunity).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/驳回原因/), { target: { value: "名字太宽泛" } });
    fireEvent.click(screen.getByRole("button", { name: "确认驳回" }));

    await waitFor(() => expect(adminRejectCommunity).toHaveBeenCalledWith("c-9", "名字太宽泛"));
  });

  it("shows an error on the row when approving fails", async () => {
    adminApproveCommunity.mockRejectedValue(new Error("boom"));
    renderWithProviders(<AdminCommunityRequestsPage />);
    await screen.findByText("DMV 羽毛球");

    fireEvent.click(screen.getByRole("button", { name: "通过" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
  });

  it("switches to processed requests without action buttons", async () => {
    renderWithProviders(<AdminCommunityRequestsPage />);
    await screen.findByText("DMV 羽毛球");
    listCommunityRequestsForAdmin.mockResolvedValue([
      { ...pendingRequest, status: "rejected", rejectionReason: "重复" }
    ]);

    fireEvent.click(screen.getByRole("button", { name: "已驳回" }));

    await waitFor(() => expect(listCommunityRequestsForAdmin).toHaveBeenLastCalledWith("rejected"));
    expect(await screen.findByText("驳回原因：重复")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "通过" })).not.toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    listCommunityRequestsForAdmin.mockResolvedValue([]);
    renderWithProviders(<AdminCommunityRequestsPage />);

    expect(await screen.findByText("暂无社区申请")).toBeInTheDocument();
  });
});

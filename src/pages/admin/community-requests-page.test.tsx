import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listCommunityRequestsForAdmin,
  adminApproveCommunity,
  adminRejectCommunity,
  adminUpdateCommunity,
  adminArchiveCommunity,
  adminRestoreCommunity
} = vi.hoisted(() => ({
  listCommunityRequestsForAdmin: vi.fn(),
  adminApproveCommunity: vi.fn(),
  adminRejectCommunity: vi.fn(),
  adminUpdateCommunity: vi.fn(),
  adminArchiveCommunity: vi.fn(),
  adminRestoreCommunity: vi.fn()
}));

vi.mock("../../repositories/community-repository", () => ({ listCommunityRequestsForAdmin }));
vi.mock("../../repositories/admin-repository", () => ({
  adminApproveCommunity,
  adminRejectCommunity,
  adminUpdateCommunity,
  adminArchiveCommunity,
  adminRestoreCommunity
}));
// AdminNav 的角标会查待审核帖子 / 举报数量，这里给最小 mock，跟其它管理页测试一样。
vi.mock("../../repositories/posts-repository", () => ({ countPendingPosts: () => Promise.resolve(0) }));
vi.mock("../../repositories/reports-repository", () => ({ countPendingReports: () => Promise.resolve(0) }));

import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
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
  creatorName: "一棵树",
  isOfficial: false,
  memberCount: 12,
  postCount: 5
};

const activeCommunity = { ...pendingRequest, status: "active" };
const officialCommunity = {
  ...pendingRequest,
  id: "c-1",
  name: "DMV 华人社区",
  slug: "dmv",
  status: "active",
  creatorName: null,
  isOfficial: true
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

  describe("community management (已通过 / 已关闭)", () => {
    async function openActiveTab(rows: unknown[]) {
      renderWithProviders(<AdminCommunityRequestsPage />);
      await screen.findByText("DMV 羽毛球");
      listCommunityRequestsForAdmin.mockResolvedValue(rows);
      fireEvent.click(screen.getByRole("button", { name: "已通过" }));
      await waitFor(() => expect(listCommunityRequestsForAdmin).toHaveBeenLastCalledWith("active"));
    }

    it("shows member/post counts, an 官方 badge, and no close button for official communities", async () => {
      await openActiveTab([activeCommunity, officialCommunity]);

      const official = (await screen.findByText("DMV 华人社区")).closest("li") as HTMLElement;
      expect(official).toHaveTextContent("官方创建");
      expect(official).toHaveTextContent("官方社区不能关闭");
      const userCommunity = screen.getByText("DMV 羽毛球").closest("li") as HTMLElement;
      expect(userCommunity).toHaveTextContent("12 名成员 · 5 条帖子");
      expect(screen.getAllByRole("button", { name: "关闭社区" })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "编辑" })).toHaveLength(2);
    });

    it("edits a community: prefilled fields, validates, then saves the trimmed values", async () => {
      adminUpdateCommunity.mockResolvedValue(undefined);
      await openActiveTab([activeCommunity]);
      await screen.findByText("DMV 羽毛球");

      fireEvent.click(screen.getByRole("button", { name: "编辑" }));
      const dialog = screen.getByRole("dialog", { name: "编辑社区" });
      const nameInput = dialog.querySelector('input[type="text"]') as HTMLInputElement;
      expect(nameInput).toHaveValue("DMV 羽毛球");

      fireEvent.change(nameInput, { target: { value: "x" } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      expect(await screen.findByText("社区名称需要 2-30 个字。")).toBeInTheDocument();
      expect(adminUpdateCommunity).not.toHaveBeenCalled();

      fireEvent.change(nameInput, { target: { value: "  DMV 羽毛球俱乐部  " } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() =>
        expect(adminUpdateCommunity).toHaveBeenCalledWith({
          communityId: "c-9",
          name: "DMV 羽毛球俱乐部",
          description: "周末约球",
          stateCodes: ["VA", "MD"],
          isOfficial: false
        })
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("keeps the edit sheet open with the database's message when the name is taken", async () => {
      adminUpdateCommunity.mockRejectedValue(
        new AppError("已经有同名的社区，换一个名称吧。", "COMMUNITY_NAME_TAKEN")
      );
      await openActiveTab([activeCommunity]);
      await screen.findByText("DMV 羽毛球");

      fireEvent.click(screen.getByRole("button", { name: "编辑" }));
      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      expect(await screen.findByText("已经有同名的社区，换一个名称吧。")).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "编辑社区" })).toBeInTheDocument();
    });

    it("closes a community only with a reason, showing member and post counts in the confirm sheet", async () => {
      adminArchiveCommunity.mockResolvedValue(undefined);
      await openActiveTab([activeCommunity]);
      await screen.findByText("DMV 羽毛球");

      fireEvent.click(screen.getByRole("button", { name: "关闭社区" }));
      expect(screen.getByRole("dialog")).toHaveTextContent("12 名成员，5 条帖子");
      fireEvent.click(screen.getByRole("button", { name: "确认关闭" }));
      expect(await screen.findByText("请填写关闭原因。")).toBeInTheDocument();
      expect(adminArchiveCommunity).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText(/关闭原因/), { target: { value: "长期无人发帖" } });
      fireEvent.click(screen.getByRole("button", { name: "确认关闭" }));

      await waitFor(() => expect(adminArchiveCommunity).toHaveBeenCalledWith("c-9", "长期无人发帖"));
    });

    it("restores a closed community from the 已关闭 tab", async () => {
      adminRestoreCommunity.mockResolvedValue(undefined);
      renderWithProviders(<AdminCommunityRequestsPage />);
      await screen.findByText("DMV 羽毛球");
      listCommunityRequestsForAdmin.mockResolvedValue([{ ...activeCommunity, status: "archived" }]);

      fireEvent.click(screen.getByRole("button", { name: "已关闭" }));
      await waitFor(() => expect(listCommunityRequestsForAdmin).toHaveBeenLastCalledWith("archived"));
      fireEvent.click(await screen.findByRole("button", { name: "恢复" }));

      await waitFor(() => expect(adminRestoreCommunity).toHaveBeenCalledWith("c-9"));
      expect(screen.queryByRole("button", { name: "关闭社区" })).not.toBeInTheDocument();
    });
  });

  it("shows an empty state", async () => {
    listCommunityRequestsForAdmin.mockResolvedValue([]);
    renderWithProviders(<AdminCommunityRequestsPage />);

    expect(await screen.findByText("暂无社区申请")).toBeInTheDocument();
  });
});

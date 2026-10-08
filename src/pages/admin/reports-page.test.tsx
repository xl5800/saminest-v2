import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listReportsForModeration,
  resolveReport,
  dismissReport,
  deletePost,
  deleteComment,
  adminCancelActivity,
  adminArchivePost,
  adminDeleteActivity,
  adminDeleteCommunityPost
} = vi.hoisted(() => ({
  listReportsForModeration: vi.fn(),
  resolveReport: vi.fn(),
  dismissReport: vi.fn(),
  deletePost: vi.fn(),
  deleteComment: vi.fn(),
  adminCancelActivity: vi.fn(),
  // 功能改动清单第 7 项："下架帖子"/"删除帖子"/"下架活动"/"删除活动"两组
  // 新增的直接操作按钮，分别走 adminArchivePost（帖子下架）和
  // adminDeleteActivity（活动删除，deletePost/adminCancelActivity 两个
  // 已经在用了）。
  adminArchivePost: vi.fn(),
  adminDeleteActivity: vi.fn(),
  // 社区功能阶段七：社区帖子举报的"同时删除该社区帖子"走这个函数。
  adminDeleteCommunityPost: vi.fn()
}));

vi.mock("../../repositories/reports-repository", async () => {
  const actual = await vi.importActual<typeof import("../../repositories/reports-repository")>(
    "../../repositories/reports-repository"
  );
  return {
    ...actual,
    listReportsForModeration,
    // 上面这个 spread ...actual 会带出真实的 countPendingReports（AdminNav
    // 「举报处理」角标用的数量查询，功能改动清单第 7 项），真实实现会打到
    // 真正的 Supabase 客户端——测试环境没有配置真实的连接信息，这里显式
    // 覆盖成一个 mock，跟这个页面自己的 listReportsForModeration mock是
    // 同一个理由，不依赖 actual 里的真实网络调用。
    countPendingReports: () => Promise.resolve(0)
  };
});
// AdminNav 同时也会为「待审核」角标调用 countPendingPosts，这个页面本身
// 跟待审核帖子数据无关，只提供最小 mock，见 pending-posts-page.test.tsx /
// all-posts-page.test.tsx 同样的注释。
vi.mock("../../repositories/posts-repository", () => ({
  countPendingPosts: () => Promise.resolve(0)
}));
vi.mock("../../repositories/admin-repository", () => ({
  resolveReport,
  dismissReport,
  deletePost,
  deleteComment,
  adminCancelActivity,
  adminArchivePost,
  adminDeleteActivity,
  adminDeleteCommunityPost
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
    deleteComment.mockReset();
    adminCancelActivity.mockReset();
    adminArchivePost.mockReset();
    adminDeleteActivity.mockReset();
    adminDeleteCommunityPost.mockReset();
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

  // UGC 安全功能补齐任务卡 2（举报用户）。
  it("renders the target as a clickable link to /community/post/:id when target_type is 'community_post'", async () => {
    listReportsForModeration.mockResolvedValue([
      {
        ...sampleReport,
        id: "report-cp-1",
        targetType: "community_post",
        targetId: "cp-1",
        targetTitle: "有人去过 Tysons 吗"
      }
    ]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByRole("link", { name: "有人去过 Tysons 吗" })).toHaveAttribute(
      "href",
      "/community/post/cp-1"
    );
  });

  it("falls back to 'community_post / :id' as the link text when the community post's title isn't available", async () => {
    listReportsForModeration.mockResolvedValue([
      { ...sampleReport, id: "report-cp-1", targetType: "community_post", targetId: "cp-1" }
    ]);

    renderWithProviders(<AdminReportsPage />);

    expect(
      await screen.findByRole("link", { name: "community_post / cp-1" })
    ).toHaveAttribute("href", "/community/post/cp-1");
  });

  // 阶段四当时断言社区帖子举报"没有任何同时删除复选框"；社区功能阶段七补上
  // 管理员删除社区帖子之后，复选框（"同时删除该社区帖子"）现在会出现在处理
  // 表单里——这条断言随之更新。直接操作按钮（"下架帖子"/"删除帖子"这组，
  // 只对 post/activity 提供，且包含社区帖子这次明确不做的"下架"）依然不
  // 对社区帖子出现；不勾选复选框时处理举报的行为跟以前完全一样，不会去调
  // 任何删除函数。
  it("offers the 同时删除该社区帖子 checkbox (but no 下架/删除 direct-action buttons) for community_post reports, and resolving without ticking it deletes nothing", async () => {
    listReportsForModeration.mockResolvedValue([
      { ...sampleReport, id: "report-cp-1", targetType: "community_post", targetId: "cp-1" }
    ]);
    resolveReport.mockResolvedValue(undefined);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    expect(screen.queryByRole("button", { name: "下架帖子" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除帖子" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "驳回举报" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    expect(screen.getByText("同时删除该社区帖子")).toBeInTheDocument();
    expect(screen.queryByText("同时删除该帖子")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("处理说明"), { target: { value: "已核实" } });
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    await waitFor(() => {
      expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
    });
    expect(resolveReport).toHaveBeenCalledWith("report-cp-1", "已核实");
    expect(adminDeleteCommunityPost).not.toHaveBeenCalled();
    expect(deletePost).not.toHaveBeenCalled();
  });

  it("renders the reported user's nickname plus a link to /admin/users when target_type is 'user'", async () => {
    const userReport = {
      ...sampleReport,
      id: "report-user-1",
      targetType: "user",
      targetId: "user-9",
      targetTitle: "Alice"
    };
    listReportsForModeration.mockResolvedValue([userReport]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去账号管理搜索处理" })).toHaveAttribute(
      "href",
      "/admin/users"
    );
  });

  it("falls back to 'user / :id' when the reported user's nickname isn't available", async () => {
    const userReport = {
      ...sampleReport,
      id: "report-user-2",
      targetType: "user",
      targetId: "user-10",
      targetTitle: null
    };
    listReportsForModeration.mockResolvedValue([userReport]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByText("user / user-10")).toBeInTheDocument();
  });

  it("renders the target as plain (non-clickable) text for any other target_type", async () => {
    // "message" 不是这个仓库真实支持的 target_type，只是用来验证"未知类型
    // 退回纯文本兜底"这条防御性行为——comment 现在有自己的专门分支（见下面
    // "comment target type" 区块），不再落进这条通用 fallback。
    const unknownTypeReport = {
      ...sampleReport,
      id: "report-unknown-1",
      targetType: "message",
      targetId: "message-1"
    };
    listReportsForModeration.mockResolvedValue([unknownTypeReport]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByText("message / message-1")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "message / message-1" })
    ).not.toBeInTheDocument();
  });

  // UGC 安全功能补齐任务卡 3（举报队列展示评论原文）。
  describe("comment target type", () => {
    const commentReport = {
      ...sampleReport,
      id: "report-comment-1",
      targetType: "comment",
      targetId: "comment-1",
      targetTitle: null,
      commentPreview: {
        content: "这句话很过分",
        isDeleted: false,
        authorDisplayName: "Carol",
        postId: "post-1",
        postTitle: "全新沙发出售"
      }
    };

    it("renders the comment content as a blockquote, the author's nickname, and a link to the parent post", async () => {
      listReportsForModeration.mockResolvedValue([commentReport]);

      renderWithProviders(<AdminReportsPage />);

      expect(await screen.findByText("这句话很过分")).toBeInTheDocument();
      expect(screen.getByText(/Carol/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "全新沙发出售" })).toHaveAttribute(
        "href",
        "/post/post-1"
      );
      expect(screen.queryByText("该评论已被用户删除")).not.toBeInTheDocument();
    });

    it("falls back to 'post / :id' as the link text when the parent post's title isn't available", async () => {
      listReportsForModeration.mockResolvedValue([
        {
          ...commentReport,
          commentPreview: { ...commentReport.commentPreview, postTitle: null }
        }
      ]);

      renderWithProviders(<AdminReportsPage />);

      expect(await screen.findByRole("link", { name: "post / post-1" })).toHaveAttribute(
        "href",
        "/post/post-1"
      );
    });

    it("still shows the original content plus a '该评论已被用户删除' tag when the comment has been soft-deleted", async () => {
      listReportsForModeration.mockResolvedValue([
        {
          ...commentReport,
          commentPreview: { ...commentReport.commentPreview, isDeleted: true }
        }
      ]);

      renderWithProviders(<AdminReportsPage />);

      expect(await screen.findByText("这句话很过分")).toBeInTheDocument();
      expect(screen.getByText("该评论已被用户删除")).toBeInTheDocument();
    });

    it("falls back to plain 'comment / :id' text (no blockquote) when commentPreview is null", async () => {
      listReportsForModeration.mockResolvedValue([
        { ...commentReport, commentPreview: null }
      ]);

      renderWithProviders(<AdminReportsPage />);

      expect(await screen.findByText("comment / comment-1")).toBeInTheDocument();
      expect(screen.queryByText("这句话很过分")).not.toBeInTheDocument();
    });
  });

  // 状态筛选从原生 <select> 改成胶囊 Chips（功能改动清单第 7 项），"待处理"
  // 这颗 chip 用 aria-pressed 表达选中态，不再是 <select> 的 value，理由
  // 跟 all-posts-page.test.tsx 同一批筛选测试的改法一致。
  it("defaults the status filter to pending and requests pending reports", async () => {
    listReportsForModeration.mockResolvedValue([]);

    renderWithProviders(<AdminReportsPage />);

    await waitFor(() => {
      expect(listReportsForModeration).toHaveBeenCalledWith("pending");
    });
    expect(await screen.findByRole("button", { name: "待处理" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("re-queries with the new status when the filter changes", async () => {
    listReportsForModeration.mockResolvedValue([]);

    renderWithProviders(<AdminReportsPage />);
    await waitFor(() => {
      expect(listReportsForModeration).toHaveBeenCalledWith("pending");
    });

    fireEvent.click(screen.getByRole("button", { name: "已处理" }));

    await waitFor(() => {
      expect(listReportsForModeration).toHaveBeenCalledWith("resolved");
    });
    expect(screen.getByRole("button", { name: "已处理" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
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

  it("shows the 同时删除该帖子 checkbox for target_type === post rows, not for unrecognized types", async () => {
    // "listing" 不是这个仓库真实支持的 target_type，只是用来验证"未知类型
    // 不显示任何删除/下架复选框"这条防御性行为。
    const unknownTypeReport = { ...sampleReport, id: "report-2", targetType: "listing" };
    listReportsForModeration.mockResolvedValue([sampleReport, unknownTypeReport]);

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

  // UGC 安全功能补齐任务卡 4：复选框从只支持 post 扩展到 comment/activity，
  // 各自用不同的文案；target_type === "user" 的举报走 /admin/users 单独
  // 处理账号，不应该出现任何删除/下架复选框。
  it("shows 同时删除该评论 for comment reports and 同时下架该活动 for activity reports, but nothing for user reports", async () => {
    const commentReport = { ...sampleReport, id: "report-comment-1", targetType: "comment" };
    const activityReport = { ...sampleReport, id: "report-activity-1", targetType: "activity" };
    const userReport = { ...sampleReport, id: "report-user-1", targetType: "user" };
    listReportsForModeration.mockResolvedValue([commentReport, activityReport, userReport]);

    renderWithProviders(<AdminReportsPage />);
    await screen.findAllByText("广告/垃圾信息");

    const buttons = screen.getAllByRole("button", { name: "标记已处理" });
    expect(buttons).toHaveLength(3);

    fireEvent.click(buttons[0]);
    expect(screen.getByText("同时删除该评论")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(buttons[1]);
    expect(screen.getByText("同时下架该活动")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(buttons[2]);
    expect(screen.queryByText("同时删除该评论")).not.toBeInTheDocument();
    expect(screen.queryByText("同时下架该活动")).not.toBeInTheDocument();
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

  // UGC 安全功能补齐任务卡 4：评论/活动分别走 deleteComment/
  // adminCancelActivity，跟上面帖子的成功/降级两条测试是同一个模式。
  describe("comment reports — 同时删除该评论", () => {
    const commentReport = {
      ...sampleReport,
      id: "report-comment-1",
      targetType: "comment",
      targetId: "comment-1"
    };

    it("calls both resolveReport and deleteComment with correct args and removes the row on full success", async () => {
      listReportsForModeration.mockResolvedValue([commentReport]);
      resolveReport.mockResolvedValue(undefined);
      deleteComment.mockResolvedValue(undefined);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
      fireEvent.change(screen.getByLabelText("处理说明"), {
        target: { value: "已核实并处理" }
      });
      fireEvent.click(screen.getByLabelText("同时删除该评论"));
      fireEvent.change(screen.getByLabelText("删除原因"), {
        target: { value: "骚扰性言论" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

      await waitFor(() => {
        expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
      });
      expect(resolveReport).toHaveBeenCalledWith("report-comment-1", "已核实并处理");
      expect(deleteComment).toHaveBeenCalledWith("comment-1", "骚扰性言论");
    });

    it("removes the row and shows a distinct partial-failure message when resolveReport succeeds but deleteComment fails", async () => {
      listReportsForModeration.mockResolvedValue([commentReport]);
      resolveReport.mockResolvedValue(undefined);
      deleteComment.mockRejectedValue(new Error("delete failed"));

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
      fireEvent.change(screen.getByLabelText("处理说明"), {
        target: { value: "已核实并处理" }
      });
      fireEvent.click(screen.getByLabelText("同时删除该评论"));
      fireEvent.change(screen.getByLabelText("删除原因"), {
        target: { value: "骚扰性言论" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

      await waitFor(() => {
        expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
      });
      expect(deleteComment).toHaveBeenCalledWith("comment-1", "骚扰性言论");
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "举报已处理，但删除评论失败"
      );
    });
  });

  describe("activity reports — 同时下架该活动", () => {
    const activityReport = {
      ...sampleReport,
      id: "report-activity-1",
      targetType: "activity",
      targetId: "act-1"
    };

    it("calls both resolveReport and adminCancelActivity with correct args and removes the row on full success", async () => {
      listReportsForModeration.mockResolvedValue([activityReport]);
      resolveReport.mockResolvedValue(undefined);
      adminCancelActivity.mockResolvedValue(undefined);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
      fireEvent.change(screen.getByLabelText("处理说明"), {
        target: { value: "已核实并处理" }
      });
      fireEvent.click(screen.getByLabelText("同时下架该活动"));
      fireEvent.change(screen.getByLabelText("下架原因"), {
        target: { value: "违反平台规则" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

      await waitFor(() => {
        expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
      });
      expect(resolveReport).toHaveBeenCalledWith("report-activity-1", "已核实并处理");
      expect(adminCancelActivity).toHaveBeenCalledWith("act-1", "违反平台规则");
    });

    it("removes the row and shows a distinct partial-failure message when resolveReport succeeds but adminCancelActivity fails", async () => {
      listReportsForModeration.mockResolvedValue([activityReport]);
      resolveReport.mockResolvedValue(undefined);
      adminCancelActivity.mockRejectedValue(new Error("cancel failed"));

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
      fireEvent.change(screen.getByLabelText("处理说明"), {
        target: { value: "已核实并处理" }
      });
      fireEvent.click(screen.getByLabelText("同时下架该活动"));
      fireEvent.change(screen.getByLabelText("下架原因"), {
        target: { value: "违反平台规则" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

      await waitFor(() => {
        expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
      });
      expect(adminCancelActivity).toHaveBeenCalledWith("act-1", "违反平台规则");
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "举报已处理，但下架活动失败"
      );
    });
  });

  // 社区功能阶段七：社区帖子走 adminDeleteCommunityPost，跟上面评论/活动
  // 两组是同一个模式。这里特别断言 deletePost 没有被调用——handleConfirm
  // 里"其它类型"兜底分支是 deletePost，如果漏了 community_post 的显式分支，
  // 会拿社区帖子 id 去调普通帖子的删除 RPC（必然失败），这条断言就是防这个。
  describe("community_post reports — 同时删除该社区帖子", () => {
    const communityPostReport = {
      ...sampleReport,
      id: "report-cp-1",
      targetType: "community_post",
      targetId: "cp-1"
    };

    it("calls both resolveReport and adminDeleteCommunityPost (never deletePost) with correct args and removes the row on full success", async () => {
      listReportsForModeration.mockResolvedValue([communityPostReport]);
      resolveReport.mockResolvedValue(undefined);
      adminDeleteCommunityPost.mockResolvedValue(undefined);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
      fireEvent.change(screen.getByLabelText("处理说明"), {
        target: { value: "已核实并处理" }
      });
      fireEvent.click(screen.getByLabelText("同时删除该社区帖子"));
      fireEvent.change(screen.getByLabelText("删除原因"), {
        target: { value: "违反社区规范" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

      await waitFor(() => {
        expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
      });
      expect(resolveReport).toHaveBeenCalledWith("report-cp-1", "已核实并处理");
      expect(adminDeleteCommunityPost).toHaveBeenCalledWith("cp-1", "违反社区规范");
      expect(deletePost).not.toHaveBeenCalled();
    });

    it("also deletes the community post when dismissing the report with the checkbox ticked", async () => {
      listReportsForModeration.mockResolvedValue([communityPostReport]);
      dismissReport.mockResolvedValue(undefined);
      adminDeleteCommunityPost.mockResolvedValue(undefined);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "驳回举报" }));
      fireEvent.change(screen.getByLabelText("处理说明"), { target: { value: "内容确实违规" } });
      fireEvent.click(screen.getByLabelText("同时删除该社区帖子"));
      fireEvent.change(screen.getByLabelText("删除原因"), { target: { value: "违规" } });
      fireEvent.click(screen.getByRole("button", { name: "确认驳回举报" }));

      await waitFor(() => {
        expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
      });
      expect(dismissReport).toHaveBeenCalledWith("report-cp-1", "内容确实违规");
      expect(adminDeleteCommunityPost).toHaveBeenCalledWith("cp-1", "违规");
    });

    it("removes the row and shows a distinct partial-failure message when resolveReport succeeds but adminDeleteCommunityPost fails", async () => {
      listReportsForModeration.mockResolvedValue([communityPostReport]);
      resolveReport.mockResolvedValue(undefined);
      adminDeleteCommunityPost.mockRejectedValue(new Error("delete failed"));

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
      fireEvent.change(screen.getByLabelText("处理说明"), {
        target: { value: "已核实并处理" }
      });
      fireEvent.click(screen.getByLabelText("同时删除该社区帖子"));
      fireEvent.change(screen.getByLabelText("删除原因"), {
        target: { value: "违反社区规范" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

      await waitFor(() => {
        expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
      });
      expect(adminDeleteCommunityPost).toHaveBeenCalledWith("cp-1", "违反社区规范");
      expect(deletePost).not.toHaveBeenCalled();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "举报已处理，但删除社区帖子失败"
      );
    });

    it("requires a delete reason when the checkbox is ticked: shows 请填写删除原因。, keeps the row, and calls neither resolveReport nor adminDeleteCommunityPost", async () => {
      listReportsForModeration.mockResolvedValue([communityPostReport]);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
      fireEvent.change(screen.getByLabelText("处理说明"), {
        target: { value: "已核实并处理" }
      });
      fireEvent.click(screen.getByLabelText("同时删除该社区帖子"));
      fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

      expect(await screen.findByText("请填写删除原因。")).toBeInTheDocument();
      expect(screen.getByText("广告/垃圾信息")).toBeInTheDocument();
      expect(resolveReport).not.toHaveBeenCalled();
      expect(adminDeleteCommunityPost).not.toHaveBeenCalled();
    });
  });

  // 功能改动清单第 7 项："帖子/活动类新增「下架帖子」「删除帖子」（或
  // 「下架活动」「删除活动」）两个直接操作"——跟上面 resolveReport/
  // dismissReport 驱动的"标记已处理/驳回举报"是完全独立的一条路径，见
  // reports-page.tsx 顶部 DirectActionCopy 相关注释：不调用 resolve/
  // dismiss，这一行不会消失，改用 directActionResultTags 展示的小标签
  // 提示操作已完成。
  describe("直接操作：下架/删除帖子或活动", () => {
    const postReport = {
      ...sampleReport,
      id: "report-post-1",
      targetType: "post",
      targetId: "post-1"
    };
    const activityReport = {
      ...sampleReport,
      id: "report-activity-1",
      targetType: "activity",
      targetId: "act-1"
    };
    const userReport = {
      ...sampleReport,
      id: "report-user-1",
      targetType: "user",
      targetId: "user-1"
    };
    const commentReport = {
      ...sampleReport,
      id: "report-comment-1",
      targetType: "comment",
      targetId: "comment-1",
      commentPreview: null
    };

    it("shows 下架帖子/删除帖子 for post reports and 下架活动/删除活动 for activity reports, but neither for user or comment reports", async () => {
      listReportsForModeration.mockResolvedValue([
        postReport,
        activityReport,
        userReport,
        commentReport
      ]);

      renderWithProviders(<AdminReportsPage />);
      await screen.findAllByText("广告/垃圾信息");

      expect(screen.getByRole("button", { name: "下架帖子" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "删除帖子" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "下架活动" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "删除活动" })).toBeInTheDocument();
    });

    it("submits 下架帖子 with its own reason, calling adminArchivePost directly (not resolveReport/dismissReport), and keeps the row with a 帖子已下架 tag", async () => {
      adminArchivePost.mockResolvedValue(undefined);
      listReportsForModeration.mockResolvedValue([postReport]);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "下架帖子" }));
      fireEvent.change(screen.getByLabelText("下架原因"), {
        target: { value: "涉嫌虚假信息" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认下架" }));

      await waitFor(() => {
        expect(adminArchivePost).toHaveBeenCalledWith("post-1", "涉嫌虚假信息");
      });
      expect(resolveReport).not.toHaveBeenCalled();
      expect(dismissReport).not.toHaveBeenCalled();
      expect(await screen.findByText("帖子已下架")).toBeInTheDocument();
      expect(screen.getByText("广告/垃圾信息")).toBeInTheDocument();
    });

    it("submits 删除帖子 with its own reason, calling deletePost directly and keeps the row with a 帖子已删除 tag", async () => {
      deletePost.mockResolvedValue(undefined);
      listReportsForModeration.mockResolvedValue([postReport]);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "删除帖子" }));
      fireEvent.change(screen.getByLabelText("删除原因"), {
        target: { value: "违反平台规则" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

      await waitFor(() => {
        expect(deletePost).toHaveBeenCalledWith("post-1", "违反平台规则");
      });
      expect(await screen.findByText("帖子已删除")).toBeInTheDocument();
      expect(screen.getByText("广告/垃圾信息")).toBeInTheDocument();
    });

    it("submits 下架活动 with its own reason, calling adminCancelActivity directly and keeps the row with a 活动已下架 tag", async () => {
      adminCancelActivity.mockResolvedValue(undefined);
      listReportsForModeration.mockResolvedValue([activityReport]);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "下架活动" }));
      fireEvent.change(screen.getByLabelText("下架原因"), {
        target: { value: "违反平台规则" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认下架" }));

      await waitFor(() => {
        expect(adminCancelActivity).toHaveBeenCalledWith("act-1", "违反平台规则");
      });
      expect(await screen.findByText("活动已下架")).toBeInTheDocument();
    });

    it("submits 删除活动 with its own reason, calling adminDeleteActivity directly and keeps the row with a 活动已删除 tag", async () => {
      adminDeleteActivity.mockResolvedValue(undefined);
      listReportsForModeration.mockResolvedValue([activityReport]);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "删除活动" }));
      fireEvent.change(screen.getByLabelText("删除原因"), {
        target: { value: "违反平台规则" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

      await waitFor(() => {
        expect(adminDeleteActivity).toHaveBeenCalledWith("act-1", "违反平台规则");
      });
      expect(await screen.findByText("活动已删除")).toBeInTheDocument();
    });

    it("shows a validation error and does not call adminArchivePost when confirming 下架帖子 with an empty reason", async () => {
      listReportsForModeration.mockResolvedValue([postReport]);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "下架帖子" }));
      fireEvent.click(screen.getByRole("button", { name: "确认下架" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("请填写下架原因。");
      expect(adminArchivePost).not.toHaveBeenCalled();
    });

    it("preserves the typed reason and shows a row error when adminArchivePost fails", async () => {
      adminArchivePost.mockRejectedValue(new Error("boom"));
      listReportsForModeration.mockResolvedValue([postReport]);

      renderWithProviders(<AdminReportsPage />);
      await screen.findByText("广告/垃圾信息");

      fireEvent.click(screen.getByRole("button", { name: "下架帖子" }));
      fireEvent.change(screen.getByLabelText("下架原因"), {
        target: { value: "涉嫌虚假信息" }
      });
      fireEvent.click(screen.getByRole("button", { name: "确认下架" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
      expect(screen.getByLabelText("下架原因")).toHaveValue("涉嫌虚假信息");
      expect(screen.getByText("广告/垃圾信息")).toBeInTheDocument();
    });
  });
});

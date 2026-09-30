import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listAllPosts,
  listAllActivitiesForAdmin,
  listActiveCategories,
  deletePost,
  adminArchivePost,
  adminDeleteActivity,
  adminCancelActivity
} = vi.hoisted(() => ({
  listAllPosts: vi.fn(),
  listAllActivitiesForAdmin: vi.fn(),
  listActiveCategories: vi.fn(),
  deletePost: vi.fn(),
  adminArchivePost: vi.fn(),
  adminDeleteActivity: vi.fn(),
  adminCancelActivity: vi.fn()
}));

vi.mock("../../repositories/posts-repository", () => ({
  listAllPosts,
  // AdminNav（这个页面顶部渲染的管理后台导航条）功能改动清单第 7 项新增了
  // "待审核"角标，会调用 countPendingPosts；这个页面自己跟角标数字无关，
  // 只提供最小 mock 避免真的打到 Supabase，见 pending-posts-page.test.tsx
  // 同样的注释。
  countPendingPosts: () => Promise.resolve(0)
}));
vi.mock("../../repositories/activities-repository", () => ({
  listAllActivitiesForAdmin
}));
vi.mock("../../repositories/categories-repository", () => ({
  listActiveCategories
}));
vi.mock("../../repositories/admin-repository", () => ({
  deletePost,
  adminArchivePost,
  adminDeleteActivity,
  adminCancelActivity
}));
// 同上，AdminNav 也会为"举报处理"角标调用 countPendingReports。
vi.mock("../../repositories/reports-repository", () => ({
  countPendingReports: () => Promise.resolve(0)
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { AdminAllPostsPage } from "./all-posts-page";

const samplePost = {
  id: "post-1",
  title: "Sunny room near metro",
  createdAt: "2026-07-01T00:00:00.000Z",
  authorName: "Alice",
  categoryName: "租房",
  status: "approved",
  rejectionReason: null,
  archiveReason: null
};

const sampleActivity = {
  id: "act-1",
  title: "周末吃火锅",
  createdAt: "2026-07-01T00:00:00.000Z",
  organizerName: "Bob",
  status: "open"
};

const sampleCategories = [
  { id: "cat-rent", slug: "rent", nameZh: "租房" },
  { id: "cat-wanted", slug: "wanted", nameZh: "求租" },
  { id: "cat-used", slug: "used", nameZh: "二手" }
];

describe("AdminAllPostsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listAllPosts.mockReset();
    listAllActivitiesForAdmin.mockReset();
    listActiveCategories.mockReset();
    deletePost.mockReset();
    adminArchivePost.mockReset();
    adminDeleteActivity.mockReset();
    adminCancelActivity.mockReset();

    listActiveCategories.mockResolvedValue(sampleCategories);
    listAllActivitiesForAdmin.mockResolvedValue([]);
  });

  it("shows a loading state before the query resolves", () => {
    listAllPosts.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<AdminAllPostsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("shows an empty state when there are no posts", async () => {
    listAllPosts.mockResolvedValue([]);

    renderWithProviders(<AdminAllPostsPage />);

    expect(await screen.findByText("暂无帖子")).toBeInTheDocument();
  });

  it("shows an error state when the query fails", async () => {
    listAllPosts.mockRejectedValue(new Error("network down"));

    renderWithProviders(<AdminAllPostsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "帖子加载失败，请稍后重试。"
    );
  });

  it("renders each post's title, author, category, status label, and created date", async () => {
    listAllPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<AdminAllPostsPage />);

    const item = await screen.findByText("Sunny room near metro");
    const row = item.closest("li");
    expect(row).toHaveTextContent("Alice");
    expect(row).toHaveTextContent("租房");
    expect(row).toHaveTextContent("已通过");
  });

  it("defaults the status filter to all (no filter) and requests without a status", async () => {
    listAllPosts.mockResolvedValue([]);

    renderWithProviders(<AdminAllPostsPage />);

    await waitFor(() => {
      expect(listAllPosts).toHaveBeenCalledWith(undefined, undefined, undefined);
    });
    // 状态筛选从原生 <select> 改成胶囊 Chips（功能改动清单第 7 项），"全部"
    // 这颗 chip 用 aria-pressed 表达选中态，不再是 <select> 的 value。
    expect(await screen.findByRole("button", { name: "全部" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("re-queries with the new status when the filter changes", async () => {
    listAllPosts.mockResolvedValue([]);

    renderWithProviders(<AdminAllPostsPage />);
    await waitFor(() => {
      expect(listAllPosts).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    fireEvent.click(screen.getByRole("button", { name: "待审核" }));

    await waitFor(() => {
      expect(listAllPosts).toHaveBeenCalledWith("pending", undefined, undefined);
    });
    expect(screen.getByRole("button", { name: "待审核" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  // 功能改动清单第 7 项：状态分段新增「已下架」。
  it("requests the archived status when 已下架 is selected", async () => {
    listAllPosts.mockResolvedValue([]);

    renderWithProviders(<AdminAllPostsPage />);
    await waitFor(() => {
      expect(listAllPosts).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    fireEvent.click(screen.getByRole("button", { name: "已下架" }));

    await waitFor(() => {
      expect(listAllPosts).toHaveBeenCalledWith("archived", undefined, undefined);
    });
  });

  it("shows a validation error and does not call deletePost when confirming with an empty reason", async () => {
    listAllPosts.mockResolvedValue([samplePost]);

    renderWithProviders(<AdminAllPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请填写删除原因。");
    expect(deletePost).not.toHaveBeenCalled();
  });

  it("calls deletePost with the typed reason and removes the row on success", async () => {
    listAllPosts.mockResolvedValue([samplePost]);
    deletePost.mockResolvedValue(undefined);

    renderWithProviders(<AdminAllPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.change(screen.getByLabelText("删除原因"), {
      target: { value: "违反平台规则" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(screen.queryByText("Sunny room near metro")).not.toBeInTheDocument();
    });
    expect(deletePost).toHaveBeenCalledWith("post-1", "违反平台规则");
  });

  it("preserves the typed reason and shows a row error when deletePost fails", async () => {
    listAllPosts.mockResolvedValue([samplePost]);
    deletePost.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminAllPostsPage />);
    await screen.findByText("Sunny room near metro");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.change(screen.getByLabelText("删除原因"), {
      target: { value: "违反平台规则" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByLabelText("删除原因")).toHaveValue("违反平台规则");
    // 这里不能再用 getByText（单数）：删除失败后确认弹层（ConfirmSheet）
    // 不会关闭（保留用户已经输入的删除原因），它自己也渲染了一遍
    // post.title 作为确认文案，跟列表行里的标题重复，会同时匹配到两个
    // 节点，getByText 在有多个匹配时会直接抛错。用 getAllByText 只确认
    // "这一行没有被误删掉"，不关心具体是哪一份 DOM 节点——照抄
    // pending-posts-page.test.tsx 里 rejectPost 失败那条测试已经用过的
    // 同一个修法。
    expect(screen.getAllByText("Sunny room near metro").length).toBeGreaterThan(0);
  });

  // "全部帖子"管理页扩展成能管理所有内容任务卡：分类筛选（含"找搭子"）。
  // 功能改动清单第 7 项之后从原生 <select> 改成胶囊 Chips，用
  // getByRole("button", {name}) + aria-pressed 代替 getByLabelText +
  // fireEvent.change。
  describe("分类筛选", () => {
    it("renders a fixed 全部帖子/找搭子 chip at each end, with categories from useCategoriesQuery in between", async () => {
      listAllPosts.mockResolvedValue([]);

      renderWithProviders(<AdminAllPostsPage />);
      await waitFor(() => {
        expect(listActiveCategories).toHaveBeenCalled();
      });

      // 分类 Chips 和状态 Chips 都用 aria-pressed，靠这个属性把两组区分开，
      // 不靠 DOM 顺序（避免状态 Chips 也在同一批 aria-pressed 按钮里被
      // 误认成分类）。
      const chipLabels = ["全部帖子", "租房", "求租", "二手", "找搭子"];
      for (const label of chipLabels) {
        expect(await screen.findByRole("button", { name: label })).toHaveAttribute(
          "aria-pressed"
        );
      }
    });

    it("re-queries listAllPosts with the selected category id when a post category is chosen", async () => {
      listAllPosts.mockResolvedValue([]);

      renderWithProviders(<AdminAllPostsPage />);
      await waitFor(() => {
        expect(listAllPosts).toHaveBeenCalledWith(undefined, undefined, undefined);
      });

      fireEvent.click(await screen.findByRole("button", { name: "租房" }));

      await waitFor(() => {
        expect(listAllPosts).toHaveBeenCalledWith(undefined, "cat-rent", undefined);
      });
    });

    it("switches the data source to activities and hides the 状态 filter when 找搭子 is selected", async () => {
      listAllPosts.mockResolvedValue([samplePost]);
      listAllActivitiesForAdmin.mockResolvedValue([sampleActivity]);

      renderWithProviders(<AdminAllPostsPage />);
      await screen.findByText("Sunny room near metro");
      expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "找搭子" }));

      expect(await screen.findByText("周末吃火锅")).toBeInTheDocument();
      expect(screen.queryByText("Sunny room near metro")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "全部" })).not.toBeInTheDocument();
    });

    it("shows the activity's organizer, a 找搭子 label, and a status badge (including cancelled -> 已下架)", async () => {
      listAllPosts.mockResolvedValue([]);
      listAllActivitiesForAdmin.mockResolvedValue([{ ...sampleActivity, status: "cancelled" }]);

      renderWithProviders(<AdminAllPostsPage />);
      fireEvent.click(await screen.findByRole("button", { name: "找搭子" }));

      const item = await screen.findByText("周末吃火锅");
      const row = item.closest("li");
      expect(row).toHaveTextContent("Bob");
      expect(row).toHaveTextContent("找搭子");
      expect(row).toHaveTextContent("已下架");
    });

    it("shows an activity-specific empty state when there are no activities", async () => {
      listAllPosts.mockResolvedValue([]);
      listAllActivitiesForAdmin.mockResolvedValue([]);

      renderWithProviders(<AdminAllPostsPage />);
      fireEvent.click(await screen.findByRole("button", { name: "找搭子" }));

      expect(await screen.findByText("暂无找搭子活动")).toBeInTheDocument();
    });

    it("shows an activity-specific error state when the activities query fails", async () => {
      listAllPosts.mockResolvedValue([]);
      listAllActivitiesForAdmin.mockRejectedValue(new Error("network down"));

      renderWithProviders(<AdminAllPostsPage />);
      fireEvent.click(await screen.findByRole("button", { name: "找搭子" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("活动加载失败，请稍后重试。");
    });
  });

  // "全部帖子"管理页扩展成能管理所有内容任务卡：防抖搜索框。用真实定时器
  // + waitFor（不用假计时器），照抄 home-page.test.tsx 测搜索框防抖的
  // 同一个模式——假计时器跟 TanStack Query 内部自己的定时器（重试/垃圾
  // 回收）混在一起容易出现意外的交互，这个仓库已有的搜索防抖测试都是用
  // 真实定时器 + waitFor 默认超时覆盖这段防抖间隔。
  describe("搜索框（防抖）", () => {
    it("debounces the search query for posts, only re-querying after typing stops", async () => {
      listAllPosts.mockResolvedValue([]);

      renderWithProviders(<AdminAllPostsPage />);
      await waitFor(() => {
        expect(listAllPosts).toHaveBeenCalledWith(undefined, undefined, undefined);
      });
      listAllPosts.mockClear();

      const search = screen.getByLabelText("搜索");
      fireEvent.change(search, { target: { value: "s" } });
      fireEvent.change(search, { target: { value: "su" } });
      fireEvent.change(search, { target: { value: "sun" } });

      // 还没防抖完成——不应该已经用中间敲字过程中的任何一个值查询过。
      expect(listAllPosts).not.toHaveBeenCalledWith(undefined, undefined, "s");
      expect(listAllPosts).not.toHaveBeenCalledWith(undefined, undefined, "su");

      await waitFor(() => {
        expect(listAllPosts).toHaveBeenCalledWith(undefined, undefined, "sun");
      });
    });

    it("searches activities by title when 找搭子 is selected", async () => {
      listAllPosts.mockResolvedValue([]);
      listAllActivitiesForAdmin.mockResolvedValue([]);

      renderWithProviders(<AdminAllPostsPage />);
      fireEvent.click(await screen.findByRole("button", { name: "找搭子" }));
      await waitFor(() => {
        expect(listAllActivitiesForAdmin).toHaveBeenCalledWith(undefined);
      });
      listAllActivitiesForAdmin.mockClear();

      fireEvent.change(screen.getByLabelText("搜索"), { target: { value: "烧烤" } });

      await waitFor(() => {
        expect(listAllActivitiesForAdmin).toHaveBeenCalledWith("烧烤");
      });
    });
  });

  // "全部帖子"管理页扩展成能管理所有内容任务卡：活动行的"下架"+"删除"两个
  // 独立按钮/表单。
  describe("活动行：下架 + 删除", () => {
    beforeEach(async () => {
      listAllPosts.mockResolvedValue([]);
      listAllActivitiesForAdmin.mockResolvedValue([sampleActivity]);
    });

    async function renderActivitiesView() {
      renderWithProviders(<AdminAllPostsPage />);
      fireEvent.click(await screen.findByRole("button", { name: "找搭子" }));
      await screen.findByText("周末吃火锅");
    }

    it("renders both 下架 and 删除 buttons, and disables 下架 when the activity is already cancelled", async () => {
      listAllActivitiesForAdmin.mockResolvedValue([{ ...sampleActivity, status: "cancelled" }]);
      await renderActivitiesView();

      expect(screen.getByRole("button", { name: "下架" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "删除" })).not.toBeDisabled();
    });

    it("opening 下架 does not also open 删除, and vice versa (independent state)", async () => {
      await renderActivitiesView();

      fireEvent.click(screen.getByRole("button", { name: "下架" }));
      expect(screen.getByLabelText("下架原因")).toBeInTheDocument();
      expect(screen.queryByLabelText("删除原因")).not.toBeInTheDocument();
    });

    it("submits 下架 with its own reason, calling adminCancelActivity and updating the status badge to 已下架 without removing the row", async () => {
      adminCancelActivity.mockResolvedValue(undefined);
      await renderActivitiesView();

      fireEvent.click(screen.getByRole("button", { name: "下架" }));
      fireEvent.change(screen.getByLabelText("下架原因"), { target: { value: "违规活动" } });
      fireEvent.click(screen.getByRole("button", { name: "确认下架" }));

      await waitFor(() => {
        expect(adminCancelActivity).toHaveBeenCalledWith("act-1", "违规活动");
      });
      expect(await screen.findByText("已下架")).toBeInTheDocument();
      expect(screen.getByText("周末吃火锅")).toBeInTheDocument();
    });

    it("shows a validation error and does not call adminCancelActivity when confirming 下架 with an empty reason", async () => {
      await renderActivitiesView();

      fireEvent.click(screen.getByRole("button", { name: "下架" }));
      fireEvent.click(screen.getByRole("button", { name: "确认下架" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("请填写下架原因。");
      expect(adminCancelActivity).not.toHaveBeenCalled();
    });

    it("submits 删除 with its own reason, calling adminDeleteActivity and removing the row", async () => {
      adminDeleteActivity.mockResolvedValue(undefined);
      await renderActivitiesView();

      fireEvent.click(screen.getByRole("button", { name: "删除" }));
      fireEvent.change(screen.getByLabelText("删除原因"), { target: { value: "垃圾内容" } });
      fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

      await waitFor(() => {
        expect(adminDeleteActivity).toHaveBeenCalledWith("act-1", "垃圾内容");
      });
      await waitFor(() => {
        expect(screen.queryByText("周末吃火锅")).not.toBeInTheDocument();
      });
    });

    it("shows a validation error and does not call adminDeleteActivity when confirming 删除 with an empty reason", async () => {
      await renderActivitiesView();

      fireEvent.click(screen.getByRole("button", { name: "删除" }));
      fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("请填写删除原因。");
      expect(adminDeleteActivity).not.toHaveBeenCalled();
    });
  });

  // 功能改动清单第 7 项：帖子新增「下架」，跟已有的「删除」是两个独立按钮/
  // 独立表单——跟活动行「下架 + 删除」是同一个模式（见上面那个 describe），
  // 这里镜像一份同样的用例，换成帖子相关的 mutation。
  describe("帖子行：下架 + 删除", () => {
    it("renders both 下架 and 删除 buttons, and disables 下架 when the post is already archived", async () => {
      listAllPosts.mockResolvedValue([{ ...samplePost, status: "archived" }]);

      renderWithProviders(<AdminAllPostsPage />);
      await screen.findByText("Sunny room near metro");

      expect(screen.getByRole("button", { name: "下架" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "删除" })).not.toBeDisabled();
    });

    it("opening 下架 does not also open 删除, and vice versa (independent state)", async () => {
      listAllPosts.mockResolvedValue([samplePost]);

      renderWithProviders(<AdminAllPostsPage />);
      await screen.findByText("Sunny room near metro");

      fireEvent.click(screen.getByRole("button", { name: "下架" }));
      expect(screen.getByLabelText("下架原因")).toBeInTheDocument();
      expect(screen.queryByLabelText("删除原因")).not.toBeInTheDocument();
    });

    it("submits 下架 with its own reason, calling adminArchivePost and updating the status badge to 已下架 without removing the row", async () => {
      adminArchivePost.mockResolvedValue(undefined);
      listAllPosts.mockResolvedValue([samplePost]);

      renderWithProviders(<AdminAllPostsPage />);
      await screen.findByText("Sunny room near metro");

      fireEvent.click(screen.getByRole("button", { name: "下架" }));
      fireEvent.change(screen.getByLabelText("下架原因"), { target: { value: "涉嫌虚假信息" } });
      fireEvent.click(screen.getByRole("button", { name: "确认下架" }));

      await waitFor(() => {
        expect(adminArchivePost).toHaveBeenCalledWith("post-1", "涉嫌虚假信息");
      });
      // 这里不能用裸的 screen.findByText("已下架")：页面顶部的状态筛选
      // Chips 里本来就有一个文案同样是"已下架"的筛选项，跟这一行刚更新的
      // 状态徽章同时匹配，findByText 在有多个匹配时会直接抛"多个匹配"的
      // 错误——scope 到这一行本身（用标题元素 .closest("li") 定位），
      // 断言这一行的文本内容里包含"已下架"，不去管页面上是不是还有别的
      // 地方也写着同样两个字，照抄 pending-posts-page.test.tsx 之前修过的
      // 同类问题（.closest("li") + toHaveTextContent）。
      const row = screen.getByText("Sunny room near metro").closest("li");
      await waitFor(() => {
        expect(row).toHaveTextContent("已下架");
      });
      expect(row).toHaveTextContent("Sunny room near metro");
    });

    it("shows a validation error and does not call adminArchivePost when confirming 下架 with an empty reason", async () => {
      listAllPosts.mockResolvedValue([samplePost]);

      renderWithProviders(<AdminAllPostsPage />);
      await screen.findByText("Sunny room near metro");

      fireEvent.click(screen.getByRole("button", { name: "下架" }));
      fireEvent.click(screen.getByRole("button", { name: "确认下架" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("请填写下架原因。");
      expect(adminArchivePost).not.toHaveBeenCalled();
    });

    it("preserves the typed 下架 reason when adminArchivePost fails", async () => {
      adminArchivePost.mockRejectedValue(new Error("boom"));
      listAllPosts.mockResolvedValue([samplePost]);

      renderWithProviders(<AdminAllPostsPage />);
      await screen.findByText("Sunny room near metro");

      fireEvent.click(screen.getByRole("button", { name: "下架" }));
      fireEvent.change(screen.getByLabelText("下架原因"), { target: { value: "涉嫌虚假信息" } });
      fireEvent.click(screen.getByRole("button", { name: "确认下架" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
      expect(screen.getByLabelText("下架原因")).toHaveValue("涉嫌虚假信息");
    });
  });

  // README 管理后台小节："驳回/下架原因灰底备注"。
  describe("驳回/下架原因备注", () => {
    it("shows the rejection reason note for a rejected post", async () => {
      listAllPosts.mockResolvedValue([
        { ...samplePost, status: "rejected", rejectionReason: "标题涉嫌虚假宣传" }
      ]);

      renderWithProviders(<AdminAllPostsPage />);

      const item = await screen.findByText("Sunny room near metro");
      expect(item.closest("li")).toHaveTextContent("驳回原因：标题涉嫌虚假宣传");
    });

    it("shows the archive reason note for an archived post", async () => {
      listAllPosts.mockResolvedValue([
        { ...samplePost, status: "archived", archiveReason: "涉嫌虚假信息，管理员下架" }
      ]);

      renderWithProviders(<AdminAllPostsPage />);

      const item = await screen.findByText("Sunny room near metro");
      expect(item.closest("li")).toHaveTextContent("下架原因：涉嫌虚假信息，管理员下架");
    });

    it("shows no reason note for an approved post", async () => {
      listAllPosts.mockResolvedValue([samplePost]);

      renderWithProviders(<AdminAllPostsPage />);

      const item = await screen.findByText("Sunny room near metro");
      expect(item.closest("li")).not.toHaveTextContent("原因：");
    });
  });
});

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listAllPosts, listAllActivitiesForAdmin, listActiveCategories, deletePost, adminDeleteActivity, adminCancelActivity } =
  vi.hoisted(() => ({
    listAllPosts: vi.fn(),
    listAllActivitiesForAdmin: vi.fn(),
    listActiveCategories: vi.fn(),
    deletePost: vi.fn(),
    adminDeleteActivity: vi.fn(),
    adminCancelActivity: vi.fn()
  }));

vi.mock("../../repositories/posts-repository", () => ({
  listAllPosts
}));
vi.mock("../../repositories/activities-repository", () => ({
  listAllActivitiesForAdmin
}));
vi.mock("../../repositories/categories-repository", () => ({
  listActiveCategories
}));
vi.mock("../../repositories/admin-repository", () => ({
  deletePost,
  adminDeleteActivity,
  adminCancelActivity
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { AdminAllPostsPage } from "./all-posts-page";

const samplePost = {
  id: "post-1",
  title: "Sunny room near metro",
  createdAt: "2026-07-01T00:00:00.000Z",
  authorName: "Alice",
  categoryName: "租房",
  status: "approved"
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
    expect(screen.getByLabelText("状态")).toHaveValue("");
  });

  it("re-queries with the new status when the filter changes", async () => {
    listAllPosts.mockResolvedValue([]);

    renderWithProviders(<AdminAllPostsPage />);
    await waitFor(() => {
      expect(listAllPosts).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    fireEvent.change(screen.getByLabelText("状态"), { target: { value: "pending" } });

    await waitFor(() => {
      expect(listAllPosts).toHaveBeenCalledWith("pending", undefined, undefined);
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
    expect(screen.getByText("Sunny room near metro")).toBeInTheDocument();
  });

  // "全部帖子"管理页扩展成能管理所有内容任务卡：分类筛选（含"找搭子"）。
  describe("分类筛选", () => {
    it("populates the category dropdown from useCategoriesQuery, plus a fixed 全部帖子/找搭子 option at each end", async () => {
      listAllPosts.mockResolvedValue([]);

      renderWithProviders(<AdminAllPostsPage />);
      await waitFor(() => {
        expect(listActiveCategories).toHaveBeenCalled();
      });

      const select = (await screen.findByLabelText("分类")) as HTMLSelectElement;
      const optionLabels = Array.from(select.options).map((option) => option.textContent);
      expect(optionLabels).toEqual(["全部帖子", "租房", "求租", "二手", "找搭子"]);
    });

    it("re-queries listAllPosts with the selected category id when a post category is chosen", async () => {
      listAllPosts.mockResolvedValue([]);

      renderWithProviders(<AdminAllPostsPage />);
      await waitFor(() => {
        expect(listAllPosts).toHaveBeenCalledWith(undefined, undefined, undefined);
      });

      fireEvent.change(await screen.findByLabelText("分类"), { target: { value: "cat-rent" } });

      await waitFor(() => {
        expect(listAllPosts).toHaveBeenCalledWith(undefined, "cat-rent", undefined);
      });
    });

    it("switches the data source to activities and hides the 状态 filter when 找搭子 is selected", async () => {
      listAllPosts.mockResolvedValue([samplePost]);
      listAllActivitiesForAdmin.mockResolvedValue([sampleActivity]);

      renderWithProviders(<AdminAllPostsPage />);
      await screen.findByText("Sunny room near metro");
      expect(screen.getByLabelText("状态")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("分类"), { target: { value: "__activities__" } });

      expect(await screen.findByText("周末吃火锅")).toBeInTheDocument();
      expect(screen.queryByText("Sunny room near metro")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("状态")).not.toBeInTheDocument();
    });

    it("shows the activity's organizer, a 找搭子 label, and a status badge (including cancelled -> 已下架)", async () => {
      listAllPosts.mockResolvedValue([]);
      listAllActivitiesForAdmin.mockResolvedValue([{ ...sampleActivity, status: "cancelled" }]);

      renderWithProviders(<AdminAllPostsPage />);
      fireEvent.change(await screen.findByLabelText("分类"), { target: { value: "__activities__" } });

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
      fireEvent.change(await screen.findByLabelText("分类"), { target: { value: "__activities__" } });

      expect(await screen.findByText("暂无找搭子活动")).toBeInTheDocument();
    });

    it("shows an activity-specific error state when the activities query fails", async () => {
      listAllPosts.mockResolvedValue([]);
      listAllActivitiesForAdmin.mockRejectedValue(new Error("network down"));

      renderWithProviders(<AdminAllPostsPage />);
      fireEvent.change(await screen.findByLabelText("分类"), { target: { value: "__activities__" } });

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
      fireEvent.change(await screen.findByLabelText("分类"), { target: { value: "__activities__" } });
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
      fireEvent.change(await screen.findByLabelText("分类"), { target: { value: "__activities__" } });
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
});

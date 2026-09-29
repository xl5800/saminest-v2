import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listAllCategoriesForAdmin, createCategory, updateCategory } = vi.hoisted(() => ({
  listAllCategoriesForAdmin: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn()
}));

vi.mock("../../repositories/categories-repository", () => ({
  listAllCategoriesForAdmin,
  createCategory,
  updateCategory
}));
// AdminNav（这个页面顶部渲染的管理后台导航条）功能改动清单第 7 项新增了
// "待审核"/"举报处理"两个角标，分别调用 countPendingPosts/
// countPendingReports——这个页面本身跟这两份数据无关，这里只提供最小 mock，
// 避免真的打到 Supabase，见 pending-posts-page.test.tsx 同样的注释。
vi.mock("../../repositories/posts-repository", () => ({
  countPendingPosts: () => Promise.resolve(0)
}));
vi.mock("../../repositories/reports-repository", () => ({
  countPendingReports: () => Promise.resolve(0)
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { AdminCategoriesPage } from "./categories-page";

const activeCategory = {
  id: "cat-1",
  slug: "rent",
  nameZh: "租房",
  nameEn: "Rent",
  description: "租房信息",
  sortOrder: 1,
  isActive: true
};

const inactiveCategory = {
  id: "cat-2",
  slug: "old",
  nameZh: "旧分类",
  nameEn: null,
  description: null,
  sortOrder: 5,
  isActive: false
};

describe("AdminCategoriesPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listAllCategoriesForAdmin.mockReset();
    createCategory.mockReset();
    updateCategory.mockReset();
  });

  it("shows a loading state before the query resolves", () => {
    listAllCategoriesForAdmin.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<AdminCategoriesPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("shows an error state when the query fails", async () => {
    listAllCategoriesForAdmin.mockRejectedValue(new Error("network down"));

    renderWithProviders(<AdminCategoriesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "分类加载失败，请稍后重试。"
    );
  });

  it("renders each category's slug, names, description, sort order, and active/inactive label", async () => {
    listAllCategoriesForAdmin.mockResolvedValue([activeCategory, inactiveCategory]);

    renderWithProviders(<AdminCategoriesPage />);

    const activeRow = (await screen.findByText("租房")).closest("li");
    expect(activeRow).toHaveTextContent("rent");
    expect(activeRow).toHaveTextContent("Rent");
    expect(activeRow).toHaveTextContent("租房信息");
    expect(activeRow).toHaveTextContent("1");
    expect(activeRow).toHaveTextContent("启用");

    const inactiveRow = screen.getByText("旧分类").closest("li");
    expect(inactiveRow).toHaveTextContent("old");
    expect(inactiveRow).toHaveTextContent("5");
    expect(inactiveRow).toHaveTextContent("已停用");
  });

  // 功能改动清单第 7 项：新建表单从页面顶部常驻的行内表单改成点击
  // "＋ 新建分类"才打开的底部弹层（CategoryFormSheet），所以每个跟创建
  // 相关的用例都要先点开这颗触发按钮，才能看到 Slug/中文名称等字段——
  // 这跟 all-posts-page.test.tsx / reports-page.test.tsx 里"先点开表单
  // 再操作字段"是同一个模式。
  it("blocks submission and shows a validation error for a missing slug, missing name_zh, or a negative sort_order, without calling createCategory", async () => {
    listAllCategoriesForAdmin.mockResolvedValue([]);

    renderWithProviders(<AdminCategoriesPage />);
    await screen.findByText("暂无分类");

    fireEvent.click(screen.getByRole("button", { name: "＋ 新建分类" }));
    fireEvent.click(screen.getByRole("button", { name: "新建分类" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请填写 slug。");
    expect(createCategory).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "furniture" }
    });
    fireEvent.click(screen.getByRole("button", { name: "新建分类" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请填写中文名称。");
    expect(createCategory).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("中文名称"), { target: { value: "家具" } });
    fireEvent.change(screen.getByLabelText("排序"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "新建分类" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "排序值必须是不小于 0 的整数。"
    );
    expect(createCategory).not.toHaveBeenCalled();
  });

  it("adds the newly created category to the list without removing existing rows, closes the sheet, and resets the draft", async () => {
    listAllCategoriesForAdmin.mockResolvedValue([activeCategory]);
    createCategory.mockResolvedValue({ id: "cat-3" });

    renderWithProviders(<AdminCategoriesPage />);
    await screen.findByText("租房");

    fireEvent.click(screen.getByRole("button", { name: "＋ 新建分类" }));
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "furniture" }
    });
    fireEvent.change(screen.getByLabelText("中文名称"), { target: { value: "家具" } });
    fireEvent.click(screen.getByRole("button", { name: "新建分类" }));

    await waitFor(() => {
      expect(createCategory).toHaveBeenCalledWith({
        slug: "furniture",
        nameZh: "家具",
        nameEn: null,
        description: null,
        sortOrder: 0
      });
    });

    expect(await screen.findByText("家具")).toBeInTheDocument();
    // 原有的行还在，不是"替换列表"而是"追加"。
    expect(screen.getByText("租房")).toBeInTheDocument();
    // 成功后弹层关闭（不再是常驻表单）。
    expect(screen.queryByLabelText("Slug")).not.toBeInTheDocument();

    // 重新打开弹层，确认草稿已经被清空。
    fireEvent.click(screen.getByRole("button", { name: "＋ 新建分类" }));
    expect(screen.getByLabelText("Slug")).toHaveValue("");
  });

  it("shows the specific duplicate-slug message when createCategory rejects with CATEGORY_SLUG_DUPLICATE, and keeps the sheet open", async () => {
    listAllCategoriesForAdmin.mockResolvedValue([]);
    createCategory.mockRejectedValue(
      new AppError("该 slug 已被使用，请换一个。", "CATEGORY_SLUG_DUPLICATE")
    );

    renderWithProviders(<AdminCategoriesPage />);
    await screen.findByText("暂无分类");

    fireEvent.click(screen.getByRole("button", { name: "＋ 新建分类" }));
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "rent" } });
    fireEvent.change(screen.getByLabelText("中文名称"), { target: { value: "租房" } });
    fireEvent.click(screen.getByRole("button", { name: "新建分类" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "该 slug 已被使用，请换一个。"
    );
    // 提交失败不关闭弹层、不丢已经输入的内容。
    expect(screen.getByLabelText("Slug")).toHaveValue("rent");
  });

  it("opens the edit form pre-filled with the row's current values", async () => {
    listAllCategoriesForAdmin.mockResolvedValue([activeCategory]);

    renderWithProviders(<AdminCategoriesPage />);
    const row = (await screen.findAllByRole("listitem"))[0];

    fireEvent.click(within(row).getByRole("button", { name: "编辑" }));

    expect(within(row).getByLabelText("Slug")).toHaveValue("rent");
    expect(within(row).getByLabelText("中文名称")).toHaveValue("租房");
    expect(within(row).getByLabelText("英文名称")).toHaveValue("Rent");
    expect(within(row).getByLabelText("描述")).toHaveValue("租房信息");
    expect(within(row).getByLabelText("排序")).toHaveValue(1);
  });

  it("blocks edit save on invalid input without calling updateCategory", async () => {
    listAllCategoriesForAdmin.mockResolvedValue([activeCategory]);

    renderWithProviders(<AdminCategoriesPage />);
    const row = (await screen.findAllByRole("listitem"))[0];

    fireEvent.click(within(row).getByRole("button", { name: "编辑" }));
    fireEvent.change(within(row).getByLabelText("Slug"), { target: { value: "" } });
    fireEvent.click(within(row).getByRole("button", { name: "保存" }));

    expect(await within(row).findByRole("alert")).toHaveTextContent("请填写 slug。");
    expect(updateCategory).not.toHaveBeenCalled();
  });

  it("saves an edited category in place without removing it from the list", async () => {
    listAllCategoriesForAdmin.mockResolvedValue([activeCategory]);
    updateCategory.mockResolvedValue(undefined);

    renderWithProviders(<AdminCategoriesPage />);
    const row = (await screen.findAllByRole("listitem"))[0];

    fireEvent.click(within(row).getByRole("button", { name: "编辑" }));
    fireEvent.change(within(row).getByLabelText("中文名称"), {
      target: { value: "出租房屋" }
    });
    fireEvent.click(within(row).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateCategory).toHaveBeenCalledWith("cat-1", {
        slug: "rent",
        nameZh: "出租房屋",
        nameEn: "Rent",
        description: "租房信息",
        sortOrder: 1
      });
    });

    expect(await within(row).findByText("出租房屋")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("preserves the edited draft and shows a row error when updateCategory fails", async () => {
    listAllCategoriesForAdmin.mockResolvedValue([activeCategory]);
    updateCategory.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminCategoriesPage />);
    const row = (await screen.findAllByRole("listitem"))[0];

    fireEvent.click(within(row).getByRole("button", { name: "编辑" }));
    fireEvent.change(within(row).getByLabelText("中文名称"), {
      target: { value: "出租房屋" }
    });
    fireEvent.click(within(row).getByRole("button", { name: "保存" }));

    expect(await within(row).findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(within(row).getByLabelText("中文名称")).toHaveValue("出租房屋");
  });

  it("toggles a category's active state in place without removing it from the list", async () => {
    listAllCategoriesForAdmin.mockResolvedValue([activeCategory, inactiveCategory]);
    updateCategory.mockResolvedValue(undefined);

    renderWithProviders(<AdminCategoriesPage />);
    await screen.findByText("租房");

    const activeRow = screen.getByText("租房").closest("li") as HTMLElement;
    fireEvent.click(within(activeRow).getByRole("button", { name: "停用" }));

    await waitFor(() => {
      expect(updateCategory).toHaveBeenCalledWith("cat-1", { isActive: false });
    });
    expect(await within(activeRow).findByText("已停用")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("租房")).toBeInTheDocument();

    const inactiveRow = screen.getByText("旧分类").closest("li") as HTMLElement;
    fireEvent.click(within(inactiveRow).getByRole("button", { name: "启用" }));

    await waitFor(() => {
      expect(updateCategory).toHaveBeenCalledWith("cat-2", { isActive: true });
    });
    expect(await within(inactiveRow).findByText("启用")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

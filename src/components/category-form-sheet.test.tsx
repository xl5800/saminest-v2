import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoryFormSheet, type CategoryFormDraft } from "./category-form-sheet";

const emptyDraft: CategoryFormDraft = {
  slug: "",
  nameZh: "",
  nameEn: "",
  description: "",
  sortOrder: "0"
};

describe("CategoryFormSheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the title and each field's current value", () => {
    render(
      <CategoryFormSheet
        title="编辑分类"
        draft={{
          slug: "rent",
          nameZh: "租房",
          nameEn: "Rent",
          description: "租房信息",
          sortOrder: "1"
        }}
        onDraftChange={vi.fn()}
        errorMessage={null}
        confirmLabel="保存"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("编辑分类")).toBeInTheDocument();
    expect(screen.getByLabelText("Slug")).toHaveValue("rent");
    expect(screen.getByLabelText("中文名称")).toHaveValue("租房");
    expect(screen.getByLabelText("英文名称")).toHaveValue("Rent");
    expect(screen.getByLabelText("描述")).toHaveValue("租房信息");
    expect(screen.getByLabelText("排序")).toHaveValue(1);
  });

  it("calls onDraftChange with the updated field when any input is edited", () => {
    const onDraftChange = vi.fn();
    render(
      <CategoryFormSheet
        title="新建分类"
        draft={emptyDraft}
        onDraftChange={onDraftChange}
        errorMessage={null}
        confirmLabel="新建分类"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "furniture" } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ ...emptyDraft, slug: "furniture" });

    fireEvent.change(screen.getByLabelText("中文名称"), { target: { value: "家具" } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ ...emptyDraft, nameZh: "家具" });

    fireEvent.change(screen.getByLabelText("英文名称"), { target: { value: "Furniture" } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ ...emptyDraft, nameEn: "Furniture" });

    fireEvent.change(screen.getByLabelText("描述"), { target: { value: "家具信息" } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ ...emptyDraft, description: "家具信息" });

    fireEvent.change(screen.getByLabelText("排序"), { target: { value: "3" } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ ...emptyDraft, sortOrder: "3" });
  });

  it("shows the error message with role=alert when provided, and nothing when null", () => {
    const { rerender } = render(
      <CategoryFormSheet
        title="新建分类"
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        errorMessage="请填写 slug。"
        confirmLabel="新建分类"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("请填写 slug。");

    rerender(
      <CategoryFormSheet
        title="新建分类"
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        errorMessage={null}
        confirmLabel="新建分类"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the slug-duplicate hint only when showSlugDuplicateHint is true", () => {
    const { rerender } = render(
      <CategoryFormSheet
        title="新建分类"
        draft={{ ...emptyDraft, slug: "rent" }}
        onDraftChange={vi.fn()}
        showSlugDuplicateHint
        errorMessage={null}
        confirmLabel="新建分类"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("此 slug 已存在。")).toBeInTheDocument();

    rerender(
      <CategoryFormSheet
        title="新建分类"
        draft={{ ...emptyDraft, slug: "rent" }}
        onDraftChange={vi.fn()}
        showSlugDuplicateHint={false}
        errorMessage={null}
        confirmLabel="新建分类"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText("此 slug 已存在。")).not.toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <CategoryFormSheet
        title="新建分类"
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        errorMessage={null}
        confirmLabel="新建分类"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "新建分类" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the cancel button, the backdrop, or Escape is used", () => {
    const onClose = vi.fn();
    render(
      <CategoryFormSheet
        title="新建分类"
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        errorMessage={null}
        confirmLabel="新建分类"
        onConfirm={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("disables every field and both buttons while pending", () => {
    render(
      <CategoryFormSheet
        title="新建分类"
        draft={{ ...emptyDraft, slug: "rent", nameZh: "租房" }}
        onDraftChange={vi.fn()}
        errorMessage={null}
        confirmLabel="新建分类"
        pending
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Slug")).toBeDisabled();
    expect(screen.getByLabelText("中文名称")).toBeDisabled();
    expect(screen.getByLabelText("英文名称")).toBeDisabled();
    expect(screen.getByLabelText("描述")).toBeDisabled();
    expect(screen.getByLabelText("排序")).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "新建分类" })).toBeDisabled();
  });
});

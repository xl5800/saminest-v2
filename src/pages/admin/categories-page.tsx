import { type FormEvent, useEffect, useState } from "react";

import { useAdminCategoriesQuery } from "../../features/admin/use-admin-categories-query";
import { useCreateCategoryMutation } from "../../features/admin/use-create-category-mutation";
import { useUpdateCategoryMutation } from "../../features/admin/use-update-category-mutation";
import type { AdminCategoryListItem } from "../../repositories/categories-repository";
import { AppError } from "../../utils/app-error";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";
const SLUG_REQUIRED_MESSAGE = "请填写 slug。";
const NAME_ZH_REQUIRED_MESSAGE = "请填写中文名称。";
const SORT_ORDER_INVALID_MESSAGE = "排序值必须是不小于 0 的整数。";
const SLUG_DUPLICATE_HINT_MESSAGE = "此 slug 已存在。";

// 跟 users-page.tsx 的 ACCOUNT_STATUS_LABELS 是同一个"给数据库字段配中文
// 文案"的惯例。
const IS_ACTIVE_LABELS: Record<"true" | "false", string> = {
  true: "启用",
  false: "已停用"
};

interface CategoryDraft {
  slug: string;
  nameZh: string;
  nameEn: string;
  description: string;
  sortOrder: string;
}

const EMPTY_DRAFT: CategoryDraft = {
  slug: "",
  nameZh: "",
  nameEn: "",
  description: "",
  sortOrder: "0"
};

function draftFromCategory(category: AdminCategoryListItem): CategoryDraft {
  return {
    slug: category.slug,
    nameZh: category.nameZh,
    nameEn: category.nameEn ?? "",
    description: category.description ?? "",
    sortOrder: String(category.sortOrder)
  };
}

interface ValidatedCategoryDraft {
  slug: string;
  nameZh: string;
  nameEn: string | null;
  description: string | null;
  sortOrder: number;
}

type DraftValidationResult =
  | { success: true; data: ValidatedCategoryDraft; error: null }
  | { success: false; data: null; error: string };

/**
 * 创建表单和编辑表单共用同一套校验规则（slug/中文名称必填，sort_order
 * 不小于 0 的整数），跟 categories 表的 categories_slug_key /
 * categories_sort_order_check 约束保持一致，不额外发明更严格或更宽松的
 * 规则——跟 publish-validation.ts 是同一个原则。
 */
function validateCategoryDraft(draft: CategoryDraft): DraftValidationResult {
  const slug = draft.slug.trim();
  const nameZh = draft.nameZh.trim();
  const nameEn = draft.nameEn.trim();
  const description = draft.description.trim();
  const sortOrderRaw = draft.sortOrder.trim();

  if (!slug) {
    return { success: false, data: null, error: SLUG_REQUIRED_MESSAGE };
  }
  if (!nameZh) {
    return { success: false, data: null, error: NAME_ZH_REQUIRED_MESSAGE };
  }

  const sortOrder = Number(sortOrderRaw);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return { success: false, data: null, error: SORT_ORDER_INVALID_MESSAGE };
  }

  return {
    success: true,
    error: null,
    data: {
      slug,
      nameZh,
      nameEn: nameEn || null,
      description: description || null,
      sortOrder
    }
  };
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function duplicateSlugErrorMessage(error: unknown): string {
  if (error instanceof AppError && error.code === "CATEGORY_SLUG_DUPLICATE") {
    return error.message;
  }
  return GENERIC_ERROR_MESSAGE;
}

/**
 * 管理员分类管理页面（/admin/categories）。跟 pending-posts-page.tsx /
 * reports-page.tsx 那些"处理队列"页面不同，分类是一份常设配置列表——新建、
 * 编辑、启用/停用都是就地更新这一行，从不把行从列表里移除（deactivate 只是
 * 把 is_active 改成 false，行还在列表里，管理员随时可以再切回来），这一点
 * 跟 users-page.tsx 的账号管理列表是同一种页面语义，见该文件顶部的注释。
 *
 * 启用/停用切换刻意不要求填写原因——跟 users-page.tsx 的账号状态变更
 * （走 set_account_status，强制要求 reason 且记 moderation_actions 审计
 * 日志）不同，产品明确把分类管理定性为系统配置而不是针对某个用户的处罚
 * 性操作，所以这里没有审计日志、也不强制填写原因，一次点击直接生效。
 *
 * slug 唯一性：输入时对照本地已加载的分类列表给一个"此 slug 已存在"的
 * 提示，纯粹是 UX 辅助（本地列表可能是陈旧的，或者两个管理员同时在改），
 * 真正的强制来自 createCategory/updateCategory 捕获数据库 23505 后抛出的
 * CATEGORY_SLUG_DUPLICATE AppError——提交时永远都会走一遍服务端校验，本地
 * 提示不能替代它。
 */
export function AdminCategoriesPage() {
  const { data, isPending, isError } = useAdminCategoriesQuery();
  const createMutation = useCreateCategoryMutation();
  const updateMutation = useUpdateCategoryMutation();

  const [categories, setCategories] = useState<AdminCategoryListItem[] | null>(
    null
  );

  const [createDraft, setCreateDraft] = useState<CategoryDraft>(EMPTY_DRAFT);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [openEditRowId, setOpenEditRowId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, CategoryDraft>>({});
  const [editValidationErrors, setEditValidationErrors] = useState<
    Record<string, string>
  >({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [actioningRowId, setActioningRowId] = useState<string | null>(null);

  useEffect(() => {
    if (data && categories === null) {
      setCategories(data);
    }
  }, [data, categories]);

  function updateCategoryInPlace(
    id: string,
    patch: Partial<AdminCategoryListItem>
  ): void {
    setCategories((prev) =>
      (prev ?? []).map((category) =>
        category.id === id ? { ...category, ...patch } : category
      )
    );
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const validation = validateCategoryDraft(createDraft);
    if (!validation.success) {
      setCreateError(validation.error);
      return;
    }

    setCreateError(null);
    setIsCreating(true);
    try {
      const { id } = await createMutation.mutateAsync(validation.data);
      setCategories((prev) => [
        ...(prev ?? []),
        {
          id,
          slug: validation.data.slug,
          nameZh: validation.data.nameZh,
          nameEn: validation.data.nameEn,
          description: validation.data.description,
          sortOrder: validation.data.sortOrder,
          isActive: true
        }
      ]);
      setCreateDraft(EMPTY_DRAFT);
    } catch (error) {
      setCreateError(duplicateSlugErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  function openEdit(category: AdminCategoryListItem): void {
    setOpenEditRowId(category.id);
    setEditDrafts((prev) => ({ ...prev, [category.id]: draftFromCategory(category) }));
    setEditValidationErrors((prev) => withoutKey(prev, category.id));
    setRowErrors((prev) => withoutKey(prev, category.id));
  }

  function cancelEdit(id: string): void {
    setOpenEditRowId((current) => (current === id ? null : current));
  }

  async function handleEditSave(id: string): Promise<void> {
    const draft = editDrafts[id] ?? EMPTY_DRAFT;
    const validation = validateCategoryDraft(draft);
    if (!validation.success) {
      setEditValidationErrors((prev) => ({ ...prev, [id]: validation.error }));
      return;
    }

    setEditValidationErrors((prev) => withoutKey(prev, id));
    setRowErrors((prev) => withoutKey(prev, id));
    setActioningRowId(id);
    try {
      await updateMutation.mutateAsync({ id, input: validation.data });
      updateCategoryInPlace(id, {
        slug: validation.data.slug,
        nameZh: validation.data.nameZh,
        nameEn: validation.data.nameEn,
        description: validation.data.description,
        sortOrder: validation.data.sortOrder
      });
      setOpenEditRowId((current) => (current === id ? null : current));
    } catch (error) {
      // 提交失败时特意不清空 editDrafts，保留管理员已经输入的内容，跟
      // users-page.tsx / reports-page.tsx 一致的"失败不丢用户输入"原则。
      setRowErrors((prev) => ({ ...prev, [id]: duplicateSlugErrorMessage(error) }));
    } finally {
      setActioningRowId(null);
    }
  }

  async function handleToggleActive(category: AdminCategoryListItem): Promise<void> {
    setRowErrors((prev) => withoutKey(prev, category.id));
    setActioningRowId(category.id);
    try {
      await updateMutation.mutateAsync({
        id: category.id,
        input: { isActive: !category.isActive }
      });
      updateCategoryInPlace(category.id, { isActive: !category.isActive });
    } catch {
      setRowErrors((prev) => ({ ...prev, [category.id]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningRowId(null);
    }
  }

  const existingSlugs = new Set((categories ?? []).map((category) => category.slug));
  const trimmedCreateSlug = createDraft.slug.trim();
  const showSlugDuplicateHint =
    trimmedCreateSlug !== "" && existingSlugs.has(trimmedCreateSlug);

  const createForm = (
    <form onSubmit={handleCreateSubmit} noValidate className="mb-6 rounded-lg border border-border bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-text">新建分类</h2>
      {createError ? (
        <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {createError}
        </p>
      ) : null}
      <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
        Slug
        <input
          type="text"
          value={createDraft.slug}
          onChange={(event) =>
            setCreateDraft((prev) => ({ ...prev, slug: event.target.value }))
          }
          disabled={isCreating}
          className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>
      {showSlugDuplicateHint ? <p className="text-xs text-warning">{SLUG_DUPLICATE_HINT_MESSAGE}</p> : null}
      <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
        中文名称
        <input
          type="text"
          value={createDraft.nameZh}
          onChange={(event) =>
            setCreateDraft((prev) => ({ ...prev, nameZh: event.target.value }))
          }
          disabled={isCreating}
          className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>
      <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
        英文名称
        <input
          type="text"
          value={createDraft.nameEn}
          onChange={(event) =>
            setCreateDraft((prev) => ({ ...prev, nameEn: event.target.value }))
          }
          disabled={isCreating}
          className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>
      <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
        描述
        <textarea
          value={createDraft.description}
          onChange={(event) =>
            setCreateDraft((prev) => ({ ...prev, description: event.target.value }))
          }
          disabled={isCreating}
          className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>
      <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
        排序
        <input
          type="number"
          min={0}
          step={1}
          value={createDraft.sortOrder}
          onChange={(event) =>
            setCreateDraft((prev) => ({ ...prev, sortOrder: event.target.value }))
          }
          disabled={isCreating}
          className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>
      <button
        type="submit"
        disabled={isCreating}
        className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        新建分类
      </button>
    </form>
  );

  if (isPending) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">分类管理</h1>
        {createForm}
        <p role="status" className="text-sm text-text-muted">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">分类管理</h1>
        {createForm}
        <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          分类加载失败，请稍后重试。
        </p>
      </main>
    );
  }

  const visibleCategories = categories ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">分类管理</h1>
      {createForm}
      {visibleCategories.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">暂无分类</p>
      ) : (
        <ul>
          {visibleCategories.map((category) => {
            const isActioning = actioningRowId === category.id;
            const isEditOpen = openEditRowId === category.id;
            const draft = editDrafts[category.id] ?? draftFromCategory(category);

            return (
              <li key={category.id} className="mb-2 rounded-lg border border-border bg-white p-4">
                {rowErrors[category.id] ? (
                  <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                    {rowErrors[category.id]}
                  </p>
                ) : null}
                {isEditOpen ? (
                  <div className="mt-3 rounded border border-border bg-bg p-3">
                    {editValidationErrors[category.id] ? (
                      <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                        {editValidationErrors[category.id]}
                      </p>
                    ) : null}
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      Slug
                      <input
                        type="text"
                        value={draft.slug}
                        onChange={(event) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [category.id]: { ...draft, slug: event.target.value }
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      中文名称
                      <input
                        type="text"
                        value={draft.nameZh}
                        onChange={(event) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [category.id]: { ...draft, nameZh: event.target.value }
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      英文名称
                      <input
                        type="text"
                        value={draft.nameEn}
                        onChange={(event) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [category.id]: { ...draft, nameEn: event.target.value }
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      描述
                      <textarea
                        value={draft.description}
                        onChange={(event) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [category.id]: {
                              ...draft,
                              description: event.target.value
                            }
                          }))
                        }
                        disabled={isActioning}
                        className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      排序
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.sortOrder}
                        onChange={(event) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [category.id]: { ...draft, sortOrder: event.target.value }
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => handleEditSave(category.id)}
                        className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => cancelEdit(category.id)}
                        className="rounded border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="mr-3 text-sm text-text-muted">{category.slug}</span>
                    <span className="mr-3 text-sm text-text">{category.nameZh}</span>
                    <span className="mr-3 text-sm text-text-muted">{category.nameEn ?? ""}</span>
                    <span className="mr-3 text-sm text-text-muted">{category.description ?? ""}</span>
                    <span className="mr-3 text-sm text-text-muted">{category.sortOrder}</span>
                    <span
                      className={`mr-3 rounded-full px-2 py-0.5 text-xs font-medium ${
                        category.isActive ? "bg-success/10 text-success" : "bg-bg text-text-muted"
                      }`}
                    >
                      {IS_ACTIVE_LABELS[category.isActive ? "true" : "false"]}
                    </span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => openEdit(category)}
                        className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => handleToggleActive(category)}
                        className={
                          category.isActive
                            ? "rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                            : "rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                        }
                      >
                        {category.isActive ? "停用" : "启用"}
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

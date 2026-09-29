import { useEffect } from "react";

export interface CategoryFormDraft {
  slug: string;
  nameZh: string;
  nameEn: string;
  description: string;
  sortOrder: string;
}

export interface CategoryFormSheetProps {
  /** 标题，蓝色 18px，跟 ReasonSheet 同一个视觉规范："新建分类"/"编辑分类"。 */
  title: string;
  draft: CategoryFormDraft;
  onDraftChange: (draft: CategoryFormDraft) => void;
  /** slug 唯一性提示（本地列表比对出来的 UX 辅助，不是提交校验，见
   *  categories-page.tsx 顶部注释），跟 errorMessage 分开展示——这一条不
   *  阻止提交，只是黄色提示；errorMessage 才是红色、阻断提交的校验错误。 */
  showSlugDuplicateHint?: boolean;
  errorMessage: string | null;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 分类管理"新建/编辑分类"底部弹层（README 管理后台小节："新建/编辑弹层
 * 字段：slug、中文名称、英文名称、描述、排序"）。跟 reason-sheet.tsx 是
 * 同一批"所有需要原因的操作统一改为底部弹出表单"改造里的组件，外壳
 * （fixed inset-0 + bg-overlay 遮罩 + rounded-t-3xl + shadow-card + 点
 * 遮罩关闭 + Esc 关闭 + 锁 body 滚动 + 蓝色 18px 标题）直接照抄
 * reason-sheet.tsx 已经确立的写法，保持全 App 底部弹层外观一致。
 *
 * 没有直接复用 ReasonSheet 本身——ReasonSheet 是"一段原因文本 + 可选的
 * 第二段原因"这个形状，这里要的是五个不同类型的字段（其中排序是数字
 * input，描述是 textarea），字段集合和校验规则（slug/中文名称必填、
 * 排序非负整数）跟"原因"这个概念没有关系，勉强套 ReasonSheet 的 props
 * 形状只会让调用方更难读，所以新建一个专门组件，只共享外壳样式。
 *
 * 同样是完全受控组件（draft/onDraftChange，不在内部自己 useState）——
 * 理由跟 ReasonSheet 一致：categories-page.tsx 现有的 createDraft/
 * editDrafts 状态本来就是"提交失败不清空"的，这个组件自己管一份内部
 * state 反而要操心跟外部同步。
 *
 * 校验规则不在这个组件里做（跟 ReasonSheet 一致）：validateCategoryDraft
 * 继续留在 categories-page.tsx，这个组件只负责把 errorMessage 展示成
 * role="alert" 的红色提示，以及把 showSlugDuplicateHint 展示成黄色提示。
 */
export function CategoryFormSheet({
  title,
  draft,
  onDraftChange,
  showSlugDuplicateHint = false,
  errorMessage,
  confirmLabel,
  cancelLabel = "取消",
  pending = false,
  onConfirm,
  onClose
}: CategoryFormSheetProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-30 flex items-end bg-overlay"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <p className="mb-4 text-lg font-medium text-primary">{title}</p>

        <label className="mb-1 block">
          <span className="mb-1 block text-sm font-medium text-text">Slug</span>
          <input
            type="text"
            value={draft.slug}
            onChange={(event) => onDraftChange({ ...draft, slug: event.target.value })}
            disabled={pending}
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        {showSlugDuplicateHint ? (
          <p className="mb-3 text-xs text-warning">此 slug 已存在。</p>
        ) : (
          <div className="mb-3" />
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-text">中文名称</span>
          <input
            type="text"
            value={draft.nameZh}
            onChange={(event) => onDraftChange({ ...draft, nameZh: event.target.value })}
            disabled={pending}
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-text">英文名称</span>
          <input
            type="text"
            value={draft.nameEn}
            onChange={(event) => onDraftChange({ ...draft, nameEn: event.target.value })}
            disabled={pending}
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-text">描述</span>
          <textarea
            value={draft.description}
            onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
            disabled={pending}
            rows={3}
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-text">排序</span>
          <input
            type="number"
            min={0}
            step={1}
            value={draft.sortOrder}
            onChange={(event) => onDraftChange({ ...draft, sortOrder: event.target.value })}
            disabled={pending}
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        {errorMessage ? (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-xl border border-border px-4 py-3 text-base font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

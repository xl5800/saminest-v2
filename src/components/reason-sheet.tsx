import { useEffect } from "react";

export interface ReasonSheetSecondaryOption {
  /** 勾选项文案，比如"同时删除该帖子"/"同时下架该活动"。 */
  checkboxLabel: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 勾选后展开的第二个原因输入框的标签，比如"删除原因"/"下架原因"。 */
  reasonLabel: string;
  reasonPlaceholder?: string;
  reasonValue: string;
  onReasonChange: (value: string) => void;
  disabled?: boolean;
}

export interface ReasonSheetProps {
  /** 标题，蓝色 18px（README 管理后台小节："所有需要原因的操作统一改为
   *  底部弹出表单...标题（蓝色 18px）"）。 */
  title: string;
  /** 操作对象一行，比如帖子标题、举报编号——告诉管理员这次操作的是哪一条。 */
  targetLabel: string;
  reasonLabel: string;
  reasonPlaceholder?: string;
  reasonValue: string;
  onReasonChange: (value: string) => void;
  /** 可选的第二个勾选项 + 第二个原因输入（举报处理页"标记已处理"时的
   *  "同时删除该帖子"一类附加操作）。不传就不渲染这一块。 */
  secondaryOption?: ReasonSheetSecondaryOption;
  /** 错误提示文案，由调用方按自己页面现有的错误文案常量传入（比如
   *  "请填写删除原因。"）——这个组件本身不做校验，只负责展示。 */
  errorMessage: string | null;
  confirmLabel: string;
  cancelLabel?: string;
  /** 破坏性操作（删除/下架/封禁等）用红色 `bg-danger` 实心按钮，其余操作
   *  （通过、标记已处理等）用 `bg-primary` 实心按钮——README 管理后台小节
   *  原文："取消」+ 确认按钮（破坏性操作红色 bg-danger，其余 bg-primary）"。 */
  destructive?: boolean;
  /** 提交中：禁用输入和两个按钮，避免重复提交。 */
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 管理后台"所有需要原因的操作统一改为底部弹出表单（替代原版行内展开）"
 * （README 管理后台小节）用的共享底部弹层外壳。
 *
 * 这个仓库目前唯一的两个底部弹层组件——post-share-action-sheet.tsx /
 * publish-action-sheet.tsx——都是纯选项列表（复制链接/分享/举报之类），
 * 没有 textarea、没有校验错误提示、没有"取消+确认"这一对按钮，跟这里要做
 * 的"输入一段原因再确认"完全是两类交互，所以不去改造那两个组件，新建
 * 一个专门的 ReasonSheet。外壳本身（fixed inset-0 + bg-overlay 遮罩 +
 * rounded-t-3xl + shadow-card + 点遮罩关闭 + Esc 关闭 + 锁 body 滚动）
 * 沿用那两个组件已经确立的写法，保持全 App 底部弹层的外观和交互统一。
 *
 * 故意设计成完全受控组件——原因文本/勾选项状态都是 props 传入
 * value+onChange，不在组件内部自己 useState。README 原文"失败不清空用户
 * 输入（沿用原版原则）"：现有各管理页（all-posts-page.tsx 等）本来就是
 * 拿一个 Map<id, string> 存每一行正在编辑的原因文本，提交失败时那个 Map
 * 不会被清空，输入自然保留；这个组件如果自己再管一份内部 state，反而要
 * 操心跟外部状态同步的问题。改成 ReasonSheet 之后这条原则不用变——只要
 * 调用方在提交失败的 catch 分支里不清空传进来的 reasonValue，输入就还在。
 *
 * 校验（比如"原因不能是空字符串"）也不在这个组件里做：每个调用点的必填
 * 原因文案本来就不一样（"请填写删除原因。"/"请填写下架原因。"/"请填写
 * 处理说明。"...），让每个页面继续用自己现有的校验函数和错误文案常量，
 * 这个组件只负责把 errorMessage 展示成 role="alert" 的红色提示。
 */
export function ReasonSheet({
  title,
  targetLabel,
  reasonLabel,
  reasonPlaceholder,
  reasonValue,
  onReasonChange,
  secondaryOption,
  errorMessage,
  confirmLabel,
  cancelLabel = "取消",
  destructive = false,
  pending = false,
  onConfirm,
  onClose
}: ReasonSheetProps) {
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
        className="w-full rounded-t-3xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <p className="text-lg font-medium text-primary">{title}</p>
        <p className="mb-4 mt-1 text-sm text-text-muted">{targetLabel}</p>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-text">{reasonLabel}</span>
          <textarea
            value={reasonValue}
            onChange={(event) => onReasonChange(event.target.value)}
            disabled={pending}
            placeholder={reasonPlaceholder}
            rows={3}
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-base text-text placeholder:text-text-muted focus:outline-none focus:ring-4 focus:ring-primary-light disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        {secondaryOption ? (
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={secondaryOption.checked}
                onChange={(event) => secondaryOption.onCheckedChange(event.target.checked)}
                disabled={pending || secondaryOption.disabled}
                className="accent-primary"
              />
              {secondaryOption.checkboxLabel}
            </label>
            {secondaryOption.checked ? (
              <label className="mt-2 block">
                <span className="mb-1 block text-sm font-medium text-text">
                  {secondaryOption.reasonLabel}
                </span>
                <textarea
                  value={secondaryOption.reasonValue}
                  onChange={(event) => secondaryOption.onReasonChange(event.target.value)}
                  disabled={pending || secondaryOption.disabled}
                  placeholder={secondaryOption.reasonPlaceholder}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-base text-text placeholder:text-text-muted focus:outline-none focus:ring-4 focus:ring-primary-light disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            ) : null}
          </div>
        ) : null}

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
            className={
              destructive
                ? "flex-1 rounded-xl bg-danger px-4 py-3 text-base font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                : "flex-1 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

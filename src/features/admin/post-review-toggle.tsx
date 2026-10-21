import { useState } from "react";

import { usePostReviewEnabledQuery, useSetPostReviewEnabledMutation } from "./use-post-review-setting";

/**
 * 后台「待审核」页顶部的发帖审核开关（只有管理员能进这个页面，数据库那边
 * app_settings 也只有管理员能读、只有管理员能改）。
 *
 * - 开：跟以前一样，分类信息帖子要管理员通过后才显示。
 * - 关：新帖子直接显示；编辑已显示的帖子也不再退回待审核。
 * 切换时已经在待审核列表里的帖子不动。
 */
export function PostReviewToggle() {
  const { data: enabled, isPending, isError } = usePostReviewEnabledQuery();
  const setEnabled = useSetPostReviewEnabledMutation();
  const [error, setError] = useState<string | null>(null);

  if (isPending) return null;

  if (isError) {
    return (
      <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
        审核开关加载失败，请稍后重试。
      </p>
    );
  }

  function toggle(): void {
    setError(null);
    setEnabled.mutate(!enabled, { onError: () => setError("切换失败，请稍后重试。") });
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-text">发帖审核</p>
          <p className="mt-1 text-sm text-text-muted">
            {enabled
              ? "已开启：招聘、房屋、二手、免费物品的新帖子要你通过后才显示。"
              : "已关闭：新帖子发布后直接显示，可以通过举报处理违规内容。"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="发帖审核"
          disabled={setEnabled.isPending}
          onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            enabled ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
              enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

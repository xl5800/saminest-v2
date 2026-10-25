import { useEffect, useState } from "react";

import {
  type AppUpdateInfo,
  checkForAppUpdate,
  dismissAppUpdate,
  toAppStoreAppUrl
} from "../app/app-update-check";

/**
 * "发现新版本"底部弹层。启动时检查一次 App Store 上的最新版本（逻辑见
 * app/app-update-check.ts），有新版本才显示；网页版和没有新版本时什么都不渲染。
 *
 * 挂在 App.tsx 上，全站只有一个实例。外壳（遮罩、底部圆角面板、Esc 关闭）
 * 照抄 nickname-prompt-sheet.tsx 的视觉——那个组件内容区是写死的昵称表单，
 * 没法复用，所以按同一套样式单独写一份。
 */
export function AppUpdateSheet() {
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkForAppUpdate().then((info) => {
      if (!cancelled) setUpdate(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function later(): void {
    if (update) dismissAppUpdate(update.latestVersion);
    setUpdate(null);
  }

  function openStore(): void {
    if (!update) return;
    window.location.href = toAppStoreAppUrl(update.storeUrl);
    setUpdate(null);
  }

  useEffect(() => {
    if (!update) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") later();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [update]);

  if (!update) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="发现新版本"
      className="fixed inset-0 z-50 flex items-end bg-overlay"
      onClick={later}
    >
      <div
        className="w-full rounded-t-3xl bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <p className="text-lg font-medium text-primary">发现新版本 {update.latestVersion}</p>
        <p className="mt-1 mb-3 text-sm text-text-muted">更新后可以使用最新功能和修复。</p>
        {update.releaseNotes ? (
          <p className="mb-4 max-h-40 overflow-y-auto whitespace-pre-line rounded-xl bg-card px-4 py-3 text-sm text-text">
            {update.releaseNotes}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={later}
            className="flex-1 rounded-xl border border-border px-4 py-3 text-base font-medium text-text hover:bg-card"
          >
            以后再说
          </button>
          <button
            type="button"
            onClick={openStore}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-hover"
          >
            立即更新
          </button>
        </div>
      </div>
    </div>
  );
}

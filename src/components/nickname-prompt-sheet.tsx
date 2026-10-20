import { useEffect, useState } from "react";

import { useMyProfileQuery } from "../features/profile/use-my-profile-query";
import { dismissNicknamePrompt } from "../features/profile/use-nickname-prompt";
import { useUpdateProfileMutation } from "../features/profile/use-update-profile-mutation";
import { MAX_DISPLAY_NAME_LENGTH } from "../pages/profile/edit-profile-validation";
import { useAuthStore } from "../store/auth-store";
import { useNicknamePromptStore } from "../store/nickname-prompt-store";
import { getModerationErrorMessage } from "../utils/app-error";

const SAVE_ERROR_MESSAGE = "保存失败，请稍后重试，或者先跳过。";

/**
 * "给自己起个名字吧"底部弹层（注册登录简化任务卡）。注册时自动分配了
 * "同城用户1234"这种默认昵称，用户第一次报名活动/发私信时弹出，可以跳过；
 * 保存或跳过之后，触发弹窗的那个操作（报名/发消息）会接着执行，见
 * features/profile/use-nickname-prompt.ts。
 *
 * 挂在 AppShell 上，全站只有一个实例，开关在 store/nickname-prompt-store.ts。
 *
 * 外壳（遮罩、底部圆角面板、Esc 关闭）照抄 components/category-form-sheet.tsx
 * 的视觉：那个组件和 reason-sheet.tsx 的内容区都是写死的（分类字段/原因
 * 输入框），没有能放"昵称输入 + 跳过"的插槽，所以按同一套样式单独写一份。
 *
 * 保存走编辑资料页同一个 useUpdateProfileMutation——updateMyProfile 一次
 * 写全部资料字段，这里把简介/地区/年龄按资料里现有的值原样带回去，只改
 * 昵称，不会把别的字段清空。
 */
export function NicknamePromptSheet() {
  const open = useNicknamePromptStore((s) => s.open);
  const finish = useNicknamePromptStore((s) => s.finish);
  const userId = useAuthStore((s) => s.session)?.user.id;
  const { data: profile } = useMyProfileQuery();
  const updateProfile = useUpdateProfileMutation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  function skip(): void {
    if (userId) dismissNicknamePrompt(userId);
    finish();
  }

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") skip();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // skip 每次渲染都是新函数，但它只依赖 userId/finish，open 变化时重新
    // 绑定一次就够了。
  }, [open, userId]);

  if (!open) return null;

  function save(): void {
    const displayName = name.trim();
    if (!displayName) {
      setError("请填写昵称。");
      return;
    }
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
      setError(`昵称不能超过 ${MAX_DISPLAY_NAME_LENGTH} 个字。`);
      return;
    }
    if (!userId || !profile) {
      // 资料没加载出来就没法安全地"只改昵称"，直接放行原操作。
      finish();
      return;
    }
    setError(null);
    updateProfile.mutate(
      {
        userId,
        displayName,
        bio: profile.bio,
        locationId: profile.locationId,
        age: profile.age
      },
      {
        onSuccess: () => finish(),
        onError: (saveError) => setError(getModerationErrorMessage(saveError) ?? SAVE_ERROR_MESSAGE)
      }
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="设置昵称"
      className="fixed inset-0 z-40 flex items-end bg-overlay"
      onClick={skip}
    >
      <div
        className="w-full rounded-t-3xl bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <p className="text-lg font-medium text-primary">给自己起个名字吧</p>
        <p className="mt-1 mb-4 text-sm text-text-muted">
          对方会看到这个名字。你现在叫「{profile?.displayName ?? ""}」。
        </p>
        <input
          type="text"
          aria-label="昵称"
          autoFocus
          value={name}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
          }}
          placeholder="比如：小王、Alice"
          className="mb-3 w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={skip}
            disabled={updateProfile.isPending}
            className="flex-1 rounded-xl border border-border px-4 py-3 text-base font-medium text-text hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
          >
            跳过
          </button>
          <button
            type="button"
            onClick={save}
            disabled={updateProfile.isPending}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateProfile.isPending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

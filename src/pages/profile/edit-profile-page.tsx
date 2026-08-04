import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useMyProfileQuery } from "../../features/profile/use-my-profile-query";
import { useUpdateDisplayNameMutation } from "../../features/profile/use-update-display-name-mutation";
import { useAuthStore } from "../../store/auth-store";
import { validateEditProfileInput } from "./edit-profile-validation";

const DEFAULT_ERROR_MESSAGE = "保存失败，请稍后重试。";

/**
 * 编辑昵称页（/profile/edit，路由已在 routes.tsx 用 RequireAuth 包裹，
 * 页面内部不做登录检查/跳转，符合 CLAUDE.md 的统一规则）。
 *
 * 卡片容器/视觉风格照抄 submit-feedback-page.tsx（同一个 max-w-md 卡片，
 * 圆角/阴影/内边距都一样）——这个项目"认证之外的一次性表单页面"都是同一套
 * 结构，不需要为这一个页面另起一套。
 *
 * 只更新 profiles.display_name 这一列；邮箱/密码是 Supabase Auth 自己的
 * 字段，改邮箱/密码是完全不同的流程（这个项目目前也没有做），不在这个
 * 页面范围内。
 *
 * 昵称初始值等 useMyProfileQuery 拉到数据后再回填一次（seededRef 保证只
 * 回填一次，不会在用户已经开始编辑后，因为后台重新拉取又把输入框内容
 * 覆盖掉）——照抄 publish-page.tsx 编辑模式回填表单字段的同一个模式。
 */
export function EditProfilePage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const { data: profile, isPending, isError } = useMyProfileQuery();
  const updateDisplayNameMutation = useUpdateDisplayNameMutation();

  const [displayName, setDisplayName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || profile == null) {
      return;
    }
    seededRef.current = true;
    setDisplayName(profile.displayName);
  }, [profile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (updateDisplayNameMutation.isPending) return;

    setValidationError(null);
    setSubmitError(null);

    const userId = session?.user.id;
    if (!userId) {
      setSubmitError(DEFAULT_ERROR_MESSAGE);
      return;
    }

    const validation = validateEditProfileInput({ displayName });
    if (!validation.success) {
      setValidationError(validation.error.message);
      return;
    }

    try {
      await updateDisplayNameMutation.mutateAsync({
        userId,
        displayName: validation.data.displayName
      });
      navigate("/profile");
    } catch {
      setSubmitError(DEFAULT_ERROR_MESSAGE);
    }
  }

  const formDisabled = isPending || isError || updateDisplayNameMutation.isPending;

  return (
    <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-text">编辑昵称</h1>
        {isPending ? (
          <p role="status" className="mb-4 text-sm text-text-muted">
            加载中…
          </p>
        ) : null}
        {isError ? (
          <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            用户信息加载失败，请稍后重试。
          </p>
        ) : null}
        <form onSubmit={handleSubmit} noValidate>
          {validationError ? (
            <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
              {validationError}
            </p>
          ) : null}
          {submitError ? (
            <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
              {submitError}
            </p>
          ) : null}
          <label className="mb-4 block text-sm font-medium text-text">
            昵称
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={formDisabled}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={formDisabled}
            className="w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateDisplayNameMutation.isPending ? "保存中…" : "保存"}
          </button>
        </form>
      </div>
    </main>
  );
}

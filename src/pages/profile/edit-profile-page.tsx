import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { AvatarPicker } from "../../components/avatar-picker";
import { TopBar } from "../../components/top-bar";
import { useLocationsQuery } from "../../features/locations/use-locations-query";
import { useMyProfileQuery } from "../../features/profile/use-my-profile-query";
import { useUpdateProfileMutation } from "../../features/profile/use-update-profile-mutation";
import { updateMyAvatarUrl } from "../../repositories/profiles-repository";
import {
  avatarStorageService,
  parseAvatarStoragePathFromUrl
} from "../../services/storage/avatar-storage-service";
import { useAuthStore } from "../../store/auth-store";
import { validateEditProfileInput } from "./edit-profile-validation";

const DEFAULT_ERROR_MESSAGE = "保存失败，请稍后重试。";
const AVATAR_UPLOAD_ERROR_MESSAGE = "头像上传失败，请稍后重试。";

/**
 * 编辑资料页（/profile/edit，路由已在 routes.tsx 用 RequireAuth 包裹，
 * 页面内部不做登录检查/跳转，符合 CLAUDE.md 的统一规则）。
 *
 * 卡片容器/视觉风格照抄 submit-feedback-page.tsx（同一个 max-w-md 卡片，
 * 圆角/阴影/内边距都一样）——这个项目"认证之外的一次性表单页面"都是同一套
 * 结构，不需要为这一个页面另起一套。
 *
 * 社交资料页第一批加了头像/简介/城市三个字段，昵称/简介/城市这三个字段
 * 走同一个"保存"按钮、同一次 updateMyProfile 提交；头像是独立的子流程：
 * 选中新文件后立刻上传+写库，不等用户点"保存"——照抄这个仓库里"选中即
 * 生效"的其它例子（比如收藏按钮），头像预览本身就是即时反馈，没有必要
 * 让用户还要多点一次保存才看到换头像生效。
 *
 * 头像上传成功、profiles.avatar_url 写库成功之后，才尝试删除旧头像文件
 * （如果原来有的话）——从旧头像的 publicUrl 反解出 storage path（见
 * avatar-storage-service.ts 的 parseAvatarStoragePathFromUrl），解析失败/
 * 删除失败都只 console.error，不影响用户已经看到的"换头像成功"这个结果
 * （跟 post-image-storage-service.ts"清理失败不能盖过主流程失败"是同一个
 * 原则）。
 *
 * 昵称/简介/城市初始值等 useMyProfileQuery 拉到数据后再回填一次
 * （seededRef 保证只回填一次，不会在用户已经开始编辑后，因为后台重新
 * 拉取又把输入框内容覆盖掉——包括头像上传成功后的 invalidateQueries 也会
 * 触发一次重新拉取，seededRef 保证这次重新拉取不会把用户正在编辑的昵称/
 * 简介/城市冲掉）——照抄 publish-page.tsx 编辑模式回填表单字段的同一个
 * 模式。
 */
export function EditProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const { data: profile, isPending, isError } = useMyProfileQuery();
  const { data: locations } = useLocationsQuery();
  const updateProfileMutation = useUpdateProfileMutation();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [locationId, setLocationId] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || profile == null) {
      return;
    }
    seededRef.current = true;
    setDisplayName(profile.displayName);
    setBio(profile.bio ?? "");
    setLocationId(profile.locationId ?? "");
  }, [profile]);

  async function handleAvatarChange(file: File | null): Promise<void> {
    setAvatarFile(file);
    if (!file) return;

    const userId = session?.user.id;
    if (!userId) {
      setAvatarError(AVATAR_UPLOAD_ERROR_MESSAGE);
      return;
    }

    setAvatarError(null);
    setAvatarUploading(true);
    const previousAvatarUrl = profile?.avatarUrl ?? null;

    try {
      const { publicUrl } = await avatarStorageService.uploadAvatar({ file, userId });
      if (!publicUrl) {
        throw new Error("头像上传成功但没有可用的访问地址。");
      }

      await updateMyAvatarUrl(userId, publicUrl);
      void queryClient.invalidateQueries({ queryKey: ["my-profile", userId] });

      if (previousAvatarUrl) {
        const previousPath = parseAvatarStoragePathFromUrl(previousAvatarUrl);
        if (previousPath) {
          try {
            await avatarStorageService.removeAvatarFile(previousPath);
          } catch (cleanupError) {
            console.error("旧头像文件清理失败：", cleanupError);
          }
        }
      }
    } catch (error) {
      console.error("头像上传失败：", error);
      setAvatarError(AVATAR_UPLOAD_ERROR_MESSAGE);
    } finally {
      setAvatarUploading(false);
      // 上传/写库流程结束后把本地选中的文件清空——不管成功还是失败，接下来
      // 头像预览都应该回到 useMyProfileQuery 拉到的权威数据（成功时是新
      // 头像，失败时还是原来那张），不应该继续显示这次选中的本地文件。
      setAvatarFile(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (updateProfileMutation.isPending) return;

    setValidationError(null);
    setSubmitError(null);

    const userId = session?.user.id;
    if (!userId) {
      setSubmitError(DEFAULT_ERROR_MESSAGE);
      return;
    }

    const validation = validateEditProfileInput({ displayName, bio, locationId });
    if (!validation.success) {
      setValidationError(validation.error.message);
      return;
    }

    try {
      await updateProfileMutation.mutateAsync({
        userId,
        displayName: validation.data.displayName,
        bio: validation.data.bio,
        locationId: validation.data.locationId
      });
      navigate("/profile");
    } catch {
      setSubmitError(DEFAULT_ERROR_MESSAGE);
    }
  }

  const formDisabled = isPending || isError || updateProfileMutation.isPending;
  const avatarInitial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <main>
      <TopBar variant="nav-only" title="编辑资料" />
      <div className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
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

          <div className="mb-6">
            <AvatarPicker
              value={avatarFile}
              onChange={(file) => void handleAvatarChange(file)}
              currentAvatarUrl={profile?.avatarUrl ?? null}
              displayNameInitial={avatarInitial}
            />
            {avatarUploading ? (
              <p role="status" className="mt-2 text-sm text-text-muted">
                头像上传中…
              </p>
            ) : null}
            {avatarError ? (
              <p role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                {avatarError}
              </p>
            ) : null}
          </div>

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
            <label className="mb-4 block text-sm font-medium text-text">
              简介（可选）
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                disabled={formDisabled}
                className="mt-1 min-h-[80px] w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="mb-4 block text-sm font-medium text-text">
              城市（可选）
              <select
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                disabled={formDisabled}
                className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">不选择城市</option>
                {(locations ?? []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={formDisabled}
              className="w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateProfileMutation.isPending ? "保存中…" : "保存"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

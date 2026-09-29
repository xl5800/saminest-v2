import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, X } from "lucide-react";

import { AvatarPicker } from "../../components/avatar-picker";
import { TopBar } from "../../components/top-bar";
import { formatLocationDisplayName, formatStateLabelByCode } from "../../data/us-states";
// design_handoff_saminest_ios 第 6 项：跟 publish-page.tsx /
// create-activity-page.tsx 反查"选中的 stateCode 对应哪一行
// locations.id"用的是同一个 hook——见那两个文件顶部对这个 hook 的说明，
// 这里不重复一遍。
import { useActivityRegionsQuery } from "../../features/locations/use-activity-regions-query";
import { useMyProfileQuery } from "../../features/profile/use-my-profile-query";
import { useUpdateProfileMutation } from "../../features/profile/use-update-profile-mutation";
import { updateMyAvatarUrl } from "../../repositories/profiles-repository";
import {
  avatarStorageService,
  parseAvatarStoragePathFromUrl
} from "../../services/storage/avatar-storage-service";
import { useAuthStore } from "../../store/auth-store";
import { usePendingEditProfileFormDraftStore } from "../../store/pending-edit-profile-form-draft-store";
import { usePendingFormRegionStore } from "../../store/pending-form-region-store";
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
 * 昵称/简介/城市/年龄初始值等 useMyProfileQuery 拉到数据后再回填一次
 * （seededRef 保证只回填一次，不会在用户已经开始编辑后，因为后台重新
 * 拉取又把输入框内容覆盖掉——包括头像上传成功后的 invalidateQueries 也会
 * 触发一次重新拉取，seededRef 保证这次重新拉取不会把用户正在编辑的昵称/
 * 简介/城市/年龄冲掉）——照抄 publish-page.tsx 编辑模式回填表单字段的
 * 同一个模式。
 *
 * "找搭子详情页改版对齐方案图"任务卡 1：年龄字段照抄地区字段的实现方式——
 * 地区选择器旁边加一个数字输入框，回填/校验/提交跟 bio/locationId 走
 * 同一套流程（seededRef 回填一次、validateEditProfileInput 校验、一次
 * updateProfileMutation 提交），不单独开一个 mutation。年龄是用户自己
 * 填写的整数，不是出生日期，没有任何自动计算逻辑——见
 * supabase/migrations/20260903050000_add_profile_age.sql 顶部说明。
 * （这条注释写于地区还是原生 <select> 的时期，第 6 项把它换成
 * /region-select 整页选择之后，"年龄照抄地区实现方式"这个类比本身没变，
 * 只是地区自己的实现方式变了。）
 *
 * 全 App 视觉 Token 体系（第二批）：昵称/简介/城市/年龄四个输入控件圆角
 * 之前是 Tailwind 默认最小档 `rounded`（4px），既不是发布/登录注册表单
 * 统一在用的 `rounded-xl`（12px），也不在 index.css 圆角表任何一档上，是
 * 一个遗漏——这次统一成 `rounded-xl`；focus 态同步从细描边
 * （focus:border-primary + focus:ring-1 focus:ring-primary）换成柔和光晕
 * （focus:ring-4 focus:ring-primary-light），跟发布页/登录注册同一套处理。
 * "保存"提交按钮圆角同理从 `rounded` 换成新的 `rounded-button`（14px）。
 * 这个文件顶部注释提到"卡片容器/视觉风格照抄 submit-feedback-page.tsx"——
 * 那个文件不在这批任务卡列出的文件清单里，这次没有跟着一起改，两个页面
 * 的输入框/按钮圆角可能因此暂时不再完全一致，供后续任务卡确认要不要
 * 一起处理。
 *
 * design_handoff_saminest_ios 第 6 项 gap #3（README「编辑资料『常驻地区』
 * 同样改为州选择」）："常驻地区"字段从原生 <select>（只能选
 * listActiveLocations() 返回的 14 个 DC/VA/MD 城市）改成跳转
 * /region-select?mode=form 整页选择全美 51 州，跟 publish-page.tsx /
 * create-activity-page.tsx 是同一套流程：点击字段先把昵称/简介/年龄存进
 * usePendingEditProfileFormDraftStore（这次导航会让本页真的卸载重挂载，
 * 不存的话这三个字段会被拉回服务端原始值，见 27 号卡），跳转
 * /region-select?mode=form，选完带着 stateCode/cityId 返回，本页消费
 * usePendingFormRegionStore 里的一次性 pendingRegion，把 stateCode 通过
 * regionsByStateCode 反查成真实的 locations.id（DC/VA/MD 下钻到具体城市
 * 时直接用 cityId）。profiles.location_id 是不区分行类型的裸外键（见
 * 20260715220000_create_profiles_table.sql），不需要新迁移就能存州级行。
 */
export function EditProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const { data: profile, isPending, isError } = useMyProfileQuery();
  const updateProfileMutation = useUpdateProfileMutation();

  // design_handoff_saminest_ios 第 6 项：stateCode → locations.id 的反查表，
  // 跟 publish-page.tsx / create-activity-page.tsx 是同一套逻辑（见下面
  // 消费 pendingRegion 的 effect）。
  const { data: regions, isError: regionsError } = useActivityRegionsQuery();
  const regionsByStateCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const region of regions ?? []) {
      if (region.stateCode) {
        map.set(region.stateCode, region.id);
      }
    }
    return map;
  }, [regions]);

  // 27 号卡同款模式：只在组件首次挂载时读一次这个 store 的快照，详细论证
  // 见 pending-post-form-draft-store.ts 顶部注释，这里不重复一遍。
  const initialDraft = useRef(
    usePendingEditProfileFormDraftStore.getState().getFreshDraft()
  ).current;

  const [displayName, setDisplayName] = useState(initialDraft?.displayName ?? "");
  const [bio, setBio] = useState(initialDraft?.bio ?? "");
  const [locationId, setLocationId] = useState("");
  // 地区字段的展示文案，跟 locationId 这个提交用的值分开存——见下面消费
  // pendingRegion 的 effect 和"常驻地区"字段的渲染，跟 publish-page.tsx /
  // create-activity-page.tsx 是同一个模式。
  const [regionLabel, setRegionLabel] = useState("");
  const [age, setAge] = useState(initialDraft?.age ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // 草稿存在就代表昵称/简介/年龄已经是"我们想要的值"（用户刚从
  // /region-select 跳回来之前自己填的），下面这个"从服务端回填"的 effect
  // 不应该再用服务端原始值把它们覆盖掉——跟 seededRef 在 publish-page.tsx
  // 里的用法是同一个道理。
  const seededRef = useRef(initialDraft !== null);

  // 草稿只应该在"从 /region-select 跳回来的这一次挂载"生效一次，挂载后
  // 立刻清空，见 pending-post-form-draft-store.ts 顶部注释同一段论证。
  useEffect(() => {
    usePendingEditProfileFormDraftStore.getState().clearDraft();
  }, []);

  useEffect(() => {
    if (seededRef.current || profile == null) {
      return;
    }
    seededRef.current = true;
    setDisplayName(profile.displayName);
    setBio(profile.bio ?? "");
    setLocationId(profile.locationId ?? "");
    setRegionLabel(profile.locationName ? formatLocationDisplayName(profile.locationName) : "");
    setAge(profile.age !== null ? String(profile.age) : "");
  }, [profile]);

  // design_handoff_saminest_ios 第 6 项：消费 /region-select 选完带回来的
  // 结果，跟 publish-page.tsx 是同一套写法——cityId 有值时（DC/VA/MD 下钻
  // 到具体城市）直接用，否则通过 regionsByStateCode 反查出真实的
  // locations.id；反查暂时查不到时先不 clearPendingRegion()，大概率是
  // regions 这条查询比选完返回还慢，effect 依赖里的 regionsByStateCode
  // 会在查询完成后重新跑一遍再重试，理由见 publish-page.tsx 同名 effect
  // 的注释，这里不重复一遍。
  const pendingRegion = usePendingFormRegionStore((s) => s.pendingRegion);
  const clearPendingRegion = usePendingFormRegionStore((s) => s.clearPendingRegion);

  useEffect(() => {
    if (!pendingRegion) return;

    if (pendingRegion.cityId) {
      setLocationId(pendingRegion.cityId);
      setRegionLabel(pendingRegion.cityName ?? formatStateLabelByCode(pendingRegion.stateCode));
      clearPendingRegion();
      return;
    }

    const resolvedId = regionsByStateCode.get(pendingRegion.stateCode);
    if (resolvedId) {
      setLocationId(resolvedId);
      setRegionLabel(formatStateLabelByCode(pendingRegion.stateCode));
      clearPendingRegion();
    }
  }, [pendingRegion, regionsByStateCode, clearPendingRegion]);

  function handleOpenRegionSelect(): void {
    usePendingEditProfileFormDraftStore.getState().saveDraft({ displayName, bio, age });
    navigate("/region-select?mode=form");
  }

  function handleClearRegion(): void {
    setLocationId("");
    setRegionLabel("");
  }

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

    const validation = validateEditProfileInput({ displayName, bio, locationId, age });
    if (!validation.success) {
      setValidationError(validation.error.message);
      return;
    }

    try {
      await updateProfileMutation.mutateAsync({
        userId,
        displayName: validation.data.displayName,
        bio: validation.data.bio,
        locationId: validation.data.locationId,
        age: validation.data.age
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
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
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
                className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="mb-4 block text-sm font-medium text-text">
              简介（可选）
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                disabled={formDisabled}
                className="mt-1 min-h-[80px] w-full rounded-xl border border-border px-3 py-2 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <div className="mb-4">
              <span className="mb-1 block text-sm font-medium text-text">常驻地区（可选）</span>
              {/* 外层是普通 div，不是 button——"清除地区"和"跳转整页选择"
                  是两个独立的可交互控件，不把"×"清除按钮嵌套进主按钮里，
                  避免"<button> 嵌套 <button>"这种非法 HTML 结构，跟
                  publish-page.tsx 里"地区"字段是同一个规避方式。 */}
              <div className="mt-1 flex items-center gap-1 rounded-xl border border-border px-3 py-2">
                <button
                  type="button"
                  onClick={handleOpenRegionSelect}
                  disabled={formDisabled}
                  className="flex min-w-0 flex-1 items-center justify-between text-left text-base disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className={`truncate ${regionLabel ? "text-text" : "text-text-muted"}`}>
                    {regionLabel || "不选择地区"}
                  </span>
                  <ChevronRight aria-hidden="true" size={16} className="ml-2 shrink-0 text-chevron" />
                </button>
                {regionLabel ? (
                  <button
                    type="button"
                    aria-label="清除地区"
                    onClick={handleClearRegion}
                    disabled={formDisabled}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X aria-hidden="true" size={14} />
                  </button>
                ) : null}
              </div>
              {regionsError ? (
                <p role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                  州加载失败，请刷新页面重试。
                </p>
              ) : null}
            </div>
            <label className="mb-4 block text-sm font-medium text-text">
              年龄（可选）
              <input
                type="number"
                inputMode="numeric"
                value={age}
                onChange={(event) => setAge(event.target.value)}
                disabled={formDisabled}
                className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <button
              type="submit"
              disabled={formDisabled}
              className="w-full rounded-button bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateProfileMutation.isPending ? "保存中…" : "保存"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

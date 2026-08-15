import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useLocationsQuery } from "../../features/locations/use-locations-query";
import {
  ACTIVITY_CHANNEL_OPTIONS,
  createActivity
} from "../../repositories/activities-repository";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import { CONTACT_METHOD_OPTIONS } from "../publish/publish-validation";
import { validateActivityInput } from "./activity-validation";

const DEFAULT_ERROR_MESSAGE = "发布失败，请稍后重试。";

/**
 * 发布活动表单（/activities/new，路由已在 routes.tsx 用 RequireAuth
 * 包裹，页面内部不做登录检查/跳转，符合 CLAUDE.md 的统一规则）。
 *
 * 整体结构、字段级校验（先本地校验、失败直接 setError 挡住，不指望数据库
 * 报错兜底）、错误提示的展示方式，都照抄 publish-page.tsx——门槛要跟发帖子
 * 一样低是设计文档第 0 节明确要求的原则，不应该为活动另起一套更复杂的
 * 表单交互。
 *
 * 这一批（第一批）只做"新建"，不做"编辑活动"——设计文档第 7 节前端范围
 * 只列了"发布活动表单"，没有编辑，且 activities_update_own 这条 RLS
 * 策略目前对发起人几乎没有字段限制（跟 posts_update_own_or_admin 那种
 * 锁死系统字段的写法不一样，细节见 activities-repository.ts 顶部注释），
 * 编辑功能涉及的校验/交互设计留到设计文档规划的第二批一起做，不在这次
 * 顺带加。
 *
 * organizer_id 不是表单字段，只从 auth-store 里当前登录用户的 session
 * 读取，用户没有任何方式在表单上编辑或伪造它——跟 publish-page.tsx 的
 * author_id 是同一个安全边界。
 *
 * 没有走 useMutation：直接 await createActivity(...)，不包一层
 * useCreateActivityMutation——照抄 publish-page.tsx 里 createPost() 的
 * 调用方式，这个仓库对"新建之后直接跳转到详情页，当前页面不需要展示
 * 局部 pending/缓存刷新"的场景，一直是直接调用 repository 函数，只有
 * "操作完还要留在当前列表页、需要 invalidate 缓存"的场景（比如收藏、
 * 报名/退出）才用 useMutation 包一层。
 */
export function CreateActivityPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);

  const { data: locations, isPending: locationsPending, isError: locationsError } =
    useLocationsQuery();

  const [channel, setChannel] = useState("");
  const [tagText, setTagText] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [landmarkText, setLandmarkText] = useState("");
  const [startAt, setStartAt] = useState("");
  const [capacity, setCapacity] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setError(null);

    const organizerId = session?.user.id;
    if (!organizerId) {
      setError("登录状态已失效，请重新登录后再发布。");
      return;
    }

    const validation = validateActivityInput({
      channel,
      tagText,
      title,
      description,
      locationId,
      landmarkText,
      isOnline,
      startAt,
      capacity,
      contactMethod,
      contactValue
    });
    if (!validation.success) {
      setError(validation.error.message);
      return;
    }

    setSubmitting(true);
    try {
      const created = await createActivity({
        organizerId,
        channel: validation.data.channel,
        tagText: validation.data.tagText,
        title: validation.data.title,
        description: validation.data.description,
        locationId: validation.data.locationId,
        landmarkText: validation.data.landmarkText,
        isOnline: validation.data.isOnline,
        startAt: validation.data.startAt,
        capacity: validation.data.capacity,
        contactMethod: validation.data.contactMethod,
        contactValue: validation.data.contactValue
      });
      navigate(`/activities/${created.id}`, { replace: true });
    } catch (submitError) {
      // 跟 publish-page.tsx 的 createPost 分支同一个模式：账号受限是一个
      // 明确、可操作的失败原因，其它未知失败原因统一用一条"请稍后重试"
      // 文案，不把底层错误细节露给用户。
      if (submitError instanceof AppError && submitError.code === "ACCOUNT_RESTRICTED") {
        setError(submitError.message);
      } else {
        setError(DEFAULT_ERROR_MESSAGE);
      }
      setSubmitting(false);
    }
  }

  return (
    <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-text">发起一起去</h1>
        <form onSubmit={handleSubmit} noValidate>
          {error ? (
            <p
              className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <label className="mb-4 block text-sm font-medium text-text">
            频道
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">请选择频道</option>
              {ACTIVITY_CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.emoji} {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-4 block text-sm font-medium text-text">
            细分标签（可选，比如"火锅"、"LOL"）
            <input
              type="text"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="mb-4 block text-sm font-medium text-text">
            标题
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="mb-4 block text-sm font-medium text-text">
            说明（人数、AA、性别偏好等都可以写在这里）
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              className="mt-1 min-h-[120px] w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="mb-4 flex items-center gap-2 text-sm font-medium text-text">
            <input
              type="checkbox"
              checked={isOnline}
              onChange={(event) => setIsOnline(event.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            线上活动（不需要选城市）
          </label>

          <label className="mb-1 block text-sm font-medium text-text">
            城市{isOnline ? "（可选）" : ""}
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              disabled={locationsPending}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">{isOnline ? "不选择城市" : "请选择城市"}</option>
              {(locations ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          {locationsError ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              城市加载失败，请刷新页面重试。
            </p>
          ) : (
            <div className="mb-4" />
          )}

          <label className="mb-4 block text-sm font-medium text-text">
            具体地标（可选，比如店名/地址，会公开展示在活动卡片上）
            <input
              type="text"
              value={landmarkText}
              onChange={(event) => setLandmarkText(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="mb-4 block text-sm font-medium text-text">
            开始时间
            <input
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="mb-4 block text-sm font-medium text-text">
            人数上限（可选，不填表示不限）
            <input
              type="number"
              min={1}
              step={1}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="mb-4 block text-sm font-medium text-text">
            联系方式类型
            <select
              value={contactMethod}
              onChange={(event) => setContactMethod(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">请选择联系方式</option>
              {CONTACT_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            联系方式内容
            <input
              type="text"
              value={contactValue}
              onChange={(event) => setContactValue(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "发布中…" : "发布活动"}
          </button>
        </form>
      </div>
    </main>
  );
}

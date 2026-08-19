import { Minus, Plus } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { useActivityRegionsQuery } from "../../features/locations/use-activity-regions-query";
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
 * 发布活动表单 / 04 号卡里的"发布搭子内容"表单（/activities/new，路由已
 * 在 routes.tsx 用 RequireAuth 包裹、在 app-shell.tsx 的 NO_CHROME_PATTERNS
 * 里，页面内部不做登录检查/跳转，也不需要自己处理"不展示底部 Tab 栏"——
 * 那是 AppShell 路由级开关的事，见 app-shell.tsx 顶部注释）。
 *
 * 校验逻辑、错误提示的展示方式完全没变（还是 validateActivityInput 先
 * 本地校验、失败直接 setError 挡住），04 号卡改的只是外层壳子和几个字段
 * 的输入控件形态：
 * - 顶部从页面自己手写的 <h1>+ 底部整行提交按钮，换成 TopBar 的 create
 *   变体（✕ 关闭 + 居中标题「发布搭子内容」+ 右侧文字「发布」按钮）——
 *   提交按钮挪到顶部之后，用一个 <form ref={formRef}> + 隐藏的
 *   formRef.current?.requestSubmit() 桥接：TopBar 的按钮在 <form> 外面
 *   （页面顶部 chrome），点击时不会自动触发原生表单提交，需要显式调用
 *   requestSubmit() 走同一条 <form onSubmit={handleSubmit}> 路径，不是
 *   另起一份提交逻辑。
 * - "频道"从 <select> 换成一排 Chips（跟活动列表页的频道筛选、
 *   category-nav.tsx 是同一套胶囊视觉），仍然是同一个 channel 状态、同一套
 *   校验，只是输入控件换了形状。
 * - "人数上限"从裸 <input type="number"> 换成 +/- 步进器，同样只是换了
 *   输入控件，capacity 还是那个字符串状态、走同一套校验（必须是大于 0 的
 *   整数，留空表示不限）。
 *
 * 封面图上传（04 号卡设计稿里的选填字段）这一轮没有做：activities 表
 * 目前没有对应的列，也没有配套的 Storage bucket（帖子的多图上传是完全
 * 独立的一套 post_images 系统，活动这边没有对应实现）——加一个只在前端
 * 能选图、提交时又不落地的上传控件，会让用户以为选的图片生效了，实际上
 * 悄悄丢掉，是比"这一轮不做"更差的体验。等后续任务卡定下 activities 封面
 * 图的表结构/Storage 方案，再补这个字段。
 *
 * 这一批（第一批）只做"新建"，不做"编辑活动"——原因见下面 organizer_id
 * 的说明段落，这次改版没有改变这个范围。
 *
 * organizer_id 不是表单字段，只从 auth-store 里当前登录用户的 session
 * 读取，用户没有任何方式在表单上编辑或伪造它——跟 publish-page.tsx 的
 * author_id 是同一个安全边界。
 *
 * "需要我同意才能加入"（P2 报名审核制）默认关闭，是唯一一个发布后不能再
 * 改的开关（这批任务没有编辑活动的入口）——发起人发布前需要想清楚要不要
 * 开审核，不是可以随时切换的设置。
 */
export function CreateActivityPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const formRef = useRef<HTMLFormElement>(null);

  const { data: regions, isPending: regionsPending, isError: regionsError } =
    useActivityRegionsQuery();

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
  // P2 报名审核制：默认关闭，保持现在"秒进"的报名体验，发起人要主动打开
  // 才会多出审核这一步。
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function adjustCapacity(delta: 1 | -1): void {
    const current = capacity.trim() ? Number(capacity) : 0;
    const next = current + delta;
    setCapacity(next > 0 ? String(next) : "");
  }

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
      contactValue,
      requiresApproval
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
        contactValue: validation.data.contactValue,
        requiresApproval: validation.data.requiresApproval
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

  const inactiveChipClassName =
    "flex h-11 items-center justify-center rounded-full border border-border bg-bg px-4 text-sm whitespace-nowrap text-text-muted";
  const activeChipClassName =
    "flex h-11 items-center justify-center rounded-full px-4 text-sm whitespace-nowrap bg-accent text-white font-semibold";

  return (
    <main data-testid="create-activity-page">
      <TopBar
        variant="create"
        title="发布搭子内容"
        onSubmit={() => formRef.current?.requestSubmit()}
        submitDisabled={submitting}
      />

      <div className="mx-auto max-w-2xl px-4 py-4 pb-10">
        <form ref={formRef} onSubmit={handleSubmit} noValidate>
          {error ? (
            <p
              className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <fieldset className="mb-4">
            <legend className="mb-1 block text-sm font-medium text-text">分类</legend>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_CHANNEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={channel === option.value}
                  onClick={() => setChannel(option.value)}
                  className={channel === option.value ? activeChipClassName : inactiveChipClassName}
                >
                  {option.emoji} {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mb-4 block text-sm font-medium text-text">
            细分标签（可选，比如"火锅"、"LOL"）
            <input
              type="text"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="mb-1 block text-sm font-medium text-text">
            标题
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <p className="mb-4 text-xs text-text-muted">
            具体位置可以写进标题里，比如"Arlington 周末爬山搭子"。
          </p>

          <label className="mb-4 block text-sm font-medium text-text">
            说明（人数、AA、性别偏好等都可以写在这里）
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              className="mt-1 min-h-[120px] w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <fieldset className="mb-4 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium text-text">地点</legend>

            <label className="mb-3 flex items-center gap-2 text-sm font-medium text-text">
              <input
                type="checkbox"
                checked={isOnline}
                onChange={(event) => setIsOnline(event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              线上活动（不需要选州）
            </label>

            <label className="mb-1 block text-sm font-medium text-text">
              州{isOnline ? "（可选）" : ""}
              <select
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                disabled={regionsPending}
                className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{isOnline ? "不选择州" : "请选择州"}</option>
                {(regions ?? []).map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
            {regionsError ? (
              <p className="mb-3 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                州加载失败，请刷新页面重试。
              </p>
            ) : (
              <div className="mb-3" />
            )}

            <label className="block text-sm font-medium text-text">
              具体地标（可选，比如店名/地址，会公开展示在活动卡片上）
              <input
                type="text"
                value={landmarkText}
                onChange={(event) => setLandmarkText(event.target.value)}
                className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </fieldset>

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

          <div className="mb-4">
            <span className="mb-1 block text-sm font-medium text-text">人数上限（不填表示不限）</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="减少人数上限"
                onClick={() => adjustCapacity(-1)}
                disabled={!capacity.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus size={16} aria-hidden="true" />
              </button>
              <span className="min-w-[3rem] text-center text-base font-semibold text-text">
                {capacity.trim() || "不限"}
              </span>
              <button
                type="button"
                aria-label="增加人数上限"
                onClick={() => adjustCapacity(1)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-text"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <fieldset className="mb-4 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium text-text">联系方式（可选）</legend>
            <label className="mb-3 block text-sm font-medium text-text">
              类型
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
            <label className="block text-sm font-medium text-text">
              内容
              <input
                type="text"
                value={contactValue}
                onChange={(event) => setContactValue(event.target.value)}
                className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </fieldset>

          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-text">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(event) => setRequiresApproval(event.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            需要我同意才能加入（默认关闭）
          </label>
        </form>
      </div>
    </main>
  );
}

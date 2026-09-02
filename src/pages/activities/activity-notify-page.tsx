import { type FormEvent, useState } from "react";
import { useParams } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { useActivityDetailQuery } from "../../features/activities/use-activity-detail-query";
import { useNotifyActivityParticipantsMutation } from "../../features/activities/use-notify-activity-participants-mutation";
import { useAuthStore } from "../../store/auth-store";

const BODY_MAX_LENGTH = 5000;
const EMPTY_BODY_ERROR = "请输入通知内容。";
const BODY_TOO_LONG_ERROR = `通知内容不能超过 ${BODY_MAX_LENGTH} 字。`;
const DEFAULT_ERROR_MESSAGE = "通知发送失败，请稍后重试。";
const SESSION_EXPIRED_MESSAGE = "登录状态已失效，请重新登录后再发送。";
const LOAD_ERROR_MESSAGE = "活动加载失败，请稍后重试。";
const NOT_ORGANIZER_MESSAGE = "只有活动发起人才能通知参与者。";
const SUBMIT_SUCCESS_MESSAGE = "通知已发送";
const FALLBACK_TITLE = "通知参与者";

/**
 * 任务卡 4：发起人群发通知参与者页面（/activities/:id/notify，独立路由，
 * 不是弹窗/浮层——这个项目里所有"填表单再提交"的场景都是独立路由，见
 * report-user-page.tsx/report-activity-page.tsx，这里照同一个结构写，
 * 不引入 modal）。
 *
 * 登录态鉴权统一由路由层的 RequireAuth 包裹实现（见 routes.tsx），页面
 * 内部不做登录检查/跳转——这是这个项目的统一规则（见 CLAUDE.md）。但
 * "是不是这个活动的发起人"是另一层授权判断，RequireAuth 管不到，需要这个
 * 页面自己判断：数据加载完成后，如果当前登录用户不是 activity.organizerId，
 * 只展示一句说明文案、不渲染表单——照抄 report-user-page.tsx 对"不能举报
 * 自己"（isSelfReport）的处理方式，不是等用户填完表单提交时才在
 * handleSubmit 里报错，也不是直接跳走/404（活动详情页本来就已经用
 * isOrganizer 隐藏了这个入口，跟"举报自己"入口已经用 !isOwnProfile 隐藏
 * 是同一个道理，但用户仍然可以手动拼一个 URL 直接访问，这里是第二道
 * 防线）。真正的权限强制在数据库那一侧（见
 * notify_activity_participants() 那份迁移，函数体内会重新校验一次
 * organizer_id = auth.uid()，前端这里不是唯一防线）。
 *
 * 活动标题/发起人 id 复用 useActivityDetailQuery（活动详情页在用的同一个
 * hook/同一份 queryKey），不新起一个查询——这个页面需要的字段
 * （title/organizerId）本来就在 ActivityDetail 里，没有理由为了这一个
 * 页面单独查一次。
 *
 * 提交调用 useNotifyActivityParticipantsMutation → notifyActivityParticipants()
 * → notify_activity_participants(uuid, text) 这个 RPC。数据库函数内部
 * 会把跟发起人存在拉黑关系的参与者悄悄跳过（不抛错、不告诉调用者跳过了
 * 谁），所以这里不需要、也没有办法展示"有 N 个人被跳过"这类细节——提交
 * 成功就是唯一的反馈，跟任务卡"不需要让调用者看到失败提示"的要求一致。
 *
 * 发送成功后停留在这个页面展示"通知已发送"，不自动跳转——跟
 * report-activity-page.tsx 的 submitted 分支是同一个模式（用一个布尔
 * state 把表单整个换成一条成功提示，不提供"再发一条"的入口，要再发只能
 * 重新进入这个页面）。
 */
export function ActivityNotifyPage() {
  const { id } = useParams<{ id: string }>();
  const session = useAuthStore((s) => s.session);

  const { data, isPending, isError } = useActivityDetailQuery(id ?? "");
  const notifyMutation = useNotifyActivityParticipantsMutation();

  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isOrganizer = !!session && !!data && session.user.id === data.organizerId;
  const pageTitle = data?.title ?? FALLBACK_TITLE;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (notifyMutation.isPending) return;

    setValidationError(null);
    setSubmitError(null);

    if (!id || !session || !data || session.user.id !== data.organizerId) {
      setSubmitError(SESSION_EXPIRED_MESSAGE);
      return;
    }

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setValidationError(EMPTY_BODY_ERROR);
      return;
    }
    if (trimmedBody.length > BODY_MAX_LENGTH) {
      setValidationError(BODY_TOO_LONG_ERROR);
      return;
    }

    try {
      await notifyMutation.mutateAsync({ activityId: id, body: trimmedBody });
      setSubmitted(true);
    } catch {
      setSubmitError(DEFAULT_ERROR_MESSAGE);
    }
  }

  return (
    <main>
      <TopBar variant="nav-only" title={pageTitle} />
      <div className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
          {isPending ? <p role="status" className="text-sm text-text-muted">加载中…</p> : null}

          {isError ? (
            <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
              {LOAD_ERROR_MESSAGE}
            </p>
          ) : null}

          {!isPending && !isError && data === null ? (
            <>
              <h1>活动未找到</h1>
              <p role="alert">活动不存在或已被取消。</p>
            </>
          ) : null}

          {!isPending && !isError && data && !isOrganizer ? (
            <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
              {NOT_ORGANIZER_MESSAGE}
            </p>
          ) : null}

          {!isPending && !isError && data && isOrganizer && submitted ? (
            <p role="status" className="rounded border border-success bg-success/10 px-3 py-2 text-sm text-success">
              {SUBMIT_SUCCESS_MESSAGE}
            </p>
          ) : null}

          {!isPending && !isError && data && isOrganizer && !submitted ? (
            <form onSubmit={handleSubmit} noValidate>
              {validationError ? (
                <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                  {validationError}
                </p>
              ) : null}
              {submitError ? (
                <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                  {submitError}
                </p>
              ) : null}
              <label className="mb-4 block text-sm font-medium text-text">
                通知内容
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="mt-1 min-h-[120px] w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <button
                type="submit"
                disabled={notifyMutation.isPending}
                className="w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {notifyMutation.isPending ? "发送中…" : "发送通知"}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </main>
  );
}

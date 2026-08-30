import { type FormEvent, useState } from "react";
import { useParams } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { useCreateReportMutation } from "../../features/reports/use-create-report-mutation";
import { REPORT_REASON_OPTIONS } from "../../repositories/reports-repository";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";

const REASON_REQUIRED_MESSAGE = "请选择举报原因。";
const DEFAULT_ERROR_MESSAGE = "举报提交失败，请稍后重试。";
const SESSION_EXPIRED_MESSAGE = "登录状态已失效，请重新登录后再提交举报。";
const SELF_REPORT_MESSAGE = "不能举报自己。";
const SUBMIT_SUCCESS_MESSAGE = "举报已提交，我们会尽快处理";

/**
 * 举报用户页面：独立路由（/users/:userId/report），照抄
 * report-activity-page.tsx 的结构——同一个 reports 表、同一套
 * REPORT_DUPLICATE/ACCOUNT_RESTRICTED 错误处理，区别只是 targetType 传
 * "user" 而不是 "activity"、id 换成 userId、标题文案换成"举报用户"。
 * UGC 安全功能补齐任务卡 2：举报的是这个用户账号本身（比如骚扰、冒充、
 * 头像/简介违规），不是这个用户发的某一条具体帖子/活动——已经有
 * report-post-page.tsx/report-activity-page.tsx 覆盖那两种场景，这里补上
 * "对人不对内容"的举报入口，跟"屏蔽用户"（任务卡 1）是同一份
 * Apple-UGC-Compliance-Review.md 第三节要求下的两个独立机制，互不依赖：
 * 屏蔽是用户自己单方面不想再看到/联系对方，举报是提请管理员介入处理，
 * 两者可以同时使用，谁先谁后不影响另一个。
 *
 * 登录态鉴权统一由路由层的 RequireAuth 包裹实现（见 routes.tsx），页面
 * 组件内部不做登录检查/跳转——这是这个项目的统一规则（见 CLAUDE.md）。
 * 这里仍然读取 session 拿 reporterId，并在提交时做一次防御性判断（参照
 * report-activity-page.tsx 的 reporterId 写法）：正常情况下 RequireAuth
 * 已经保证进到这个页面时是登录状态，这个判断只应对 session 中途失效这种
 * 边缘情况，不是路由鉴权本身。
 *
 * "不能举报自己"：入口本身已经在 user-profile-page.tsx 里用
 * !isOwnProfile 隐藏了（跟"发消息"/"屏蔽此人"两个按钮同一个判断），但
 * 这个页面是一个独立路由，用户仍然可以手动拼一个指向自己 id 的 URL 直接
 * 访问——这里在渲染阶段就判断 userId 是否等于当前登录用户 id，是则直接
 * 展示一条说明文案、不渲染表单，不是等用户填完表单提交时才在
 * handleSubmit 里报错。reports 表本身没有在数据库层强制这条规则（RLS 的
 * reports_insert_own 策略跟其它 target_type 一样，只检查
 * reporter_id = auth.uid()，不检查 target_id 是否等于 reporter_id——见
 * 对应迁移文件顶部说明），这是纯前端层面的一道防线，不是唯一防线不重要，
 * 而是"举报自己"本身不是一个需要数据库强一致性保证的场景（跟"不能给自己
 * 发消息"当初也是纯前端判断、后来才在 create_profile_conversation 里补了
 * 一条防御性检查不同，这次任务范围明确不涉及改 reports 的 RLS/数据库层，
 * 见任务卡"禁止修改"部分）。
 */
export function ReportUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const session = useAuthStore((s) => s.session);

  const createReportMutation = useCreateReportMutation();

  const [reasonCode, setReasonCode] = useState("");
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isSelfReport = !!session && session.user.id === userId;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (createReportMutation.isPending) return;

    setValidationError(null);
    setSubmitError(null);

    const reporterId = session?.user.id;
    if (!reporterId) {
      setSubmitError(SESSION_EXPIRED_MESSAGE);
      return;
    }

    if (reporterId === userId) {
      setSubmitError(SELF_REPORT_MESSAGE);
      return;
    }

    if (!reasonCode) {
      setValidationError(REASON_REQUIRED_MESSAGE);
      return;
    }

    const trimmedDescription = description.trim();

    try {
      await createReportMutation.mutateAsync({
        reporterId,
        targetType: "user",
        targetId: userId ?? "",
        reasonCode,
        description: trimmedDescription ? trimmedDescription : null
      });
      setSubmitted(true);
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === "REPORT_DUPLICATE" || error.code === "ACCOUNT_RESTRICTED")
      ) {
        setSubmitError(error.message);
      } else {
        setSubmitError(DEFAULT_ERROR_MESSAGE);
      }
    }
  }

  if (isSelfReport) {
    return (
      <main>
        <TopBar variant="nav-only" title="举报用户" />
        <div className="flex justify-center px-4 py-10 pb-20 md:pb-10">
          <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
            <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
              {SELF_REPORT_MESSAGE}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main>
        <TopBar variant="nav-only" title="举报用户" />
        <div className="flex justify-center px-4 py-10 pb-20 md:pb-10">
          <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
            <p role="status" className="rounded border border-success bg-success/10 px-3 py-2 text-sm text-success">
              {SUBMIT_SUCCESS_MESSAGE}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <TopBar variant="nav-only" title="举报用户" />
      <div className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
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
            <fieldset className="mb-4">
              <legend className="mb-2 text-sm font-medium text-text">举报原因</legend>
              {REPORT_REASON_OPTIONS.map((option) => (
                <label key={option.value} className="mb-1 flex items-center gap-2 text-sm text-text">
                  <input
                    type="radio"
                    name="reasonCode"
                    value={option.value}
                    checked={reasonCode === option.value}
                    onChange={() => setReasonCode(option.value)}
                    className="accent-primary"
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <label className="mb-4 block text-sm font-medium text-text">
              补充说明（可选）
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-1 min-h-[80px] w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <button
              type="submit"
              disabled={createReportMutation.isPending}
              className="w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createReportMutation.isPending ? "提交中…" : "提交举报"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

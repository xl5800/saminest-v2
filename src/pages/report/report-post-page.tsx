import { type FormEvent, useState } from "react";
import { useParams } from "react-router-dom";

import { useCreateReportMutation } from "../../features/reports/use-create-report-mutation";
import { REPORT_REASON_OPTIONS } from "../../repositories/reports-repository";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";

const REASON_REQUIRED_MESSAGE = "请选择举报原因。";
const DEFAULT_ERROR_MESSAGE = "举报提交失败，请稍后重试。";
const SESSION_EXPIRED_MESSAGE = "登录状态已失效，请重新登录后再提交举报。";
const SUBMIT_SUCCESS_MESSAGE = "举报已提交，我们会尽快处理";

/**
 * 举报帖子页面：独立路由（/post/:id/report），不用弹窗——这个项目里所有
 * 需要表单的流程（登录、注册、重置密码、发布）都是独立页面，这里保持一致。
 *
 * 登录态鉴权统一由路由层的 RequireAuth 包裹实现（见 routes.tsx），
 * 页面组件内部不做登录检查/跳转——这是这个项目的统一规则（见 CLAUDE.md）。
 * 这里仍然读取 session 拿 reporterId，并在提交时做一次防御性判断（参照
 * publish-page.tsx 的 authorId 写法）：正常情况下 RequireAuth 已经保证
 * 进到这个页面时是登录状态，这个判断只应对 session 中途失效这种边缘情况，
 * 不是路由鉴权本身。
 */
export function ReportPostPage() {
  const { id } = useParams<{ id: string }>();
  const session = useAuthStore((s) => s.session);

  const createReportMutation = useCreateReportMutation();

  const [reasonCode, setReasonCode] = useState("");
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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

    if (!reasonCode) {
      setValidationError(REASON_REQUIRED_MESSAGE);
      return;
    }

    const trimmedDescription = description.trim();

    try {
      await createReportMutation.mutateAsync({
        reporterId,
        targetType: "post",
        targetId: id ?? "",
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

  if (submitted) {
    return (
      <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-xl font-bold text-text">举报帖子</h1>
          <p role="status" className="rounded border border-success bg-success/10 px-3 py-2 text-sm text-success">
            {SUBMIT_SUCCESS_MESSAGE}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-text">举报帖子</h1>
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
    </main>
  );
}

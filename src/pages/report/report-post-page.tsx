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
      if (error instanceof AppError && error.code === "REPORT_DUPLICATE") {
        setSubmitError(error.message);
      } else {
        setSubmitError(DEFAULT_ERROR_MESSAGE);
      }
    }
  }

  if (submitted) {
    return (
      <main>
        <h1>举报帖子</h1>
        <p role="status">{SUBMIT_SUCCESS_MESSAGE}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>举报帖子</h1>
      <form onSubmit={handleSubmit} noValidate>
        {validationError ? <p role="alert">{validationError}</p> : null}
        {submitError ? <p role="alert">{submitError}</p> : null}
        <fieldset>
          <legend>举报原因</legend>
          {REPORT_REASON_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="reasonCode"
                value={option.value}
                checked={reasonCode === option.value}
                onChange={() => setReasonCode(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <label>
          补充说明（可选）
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <button type="submit" disabled={createReportMutation.isPending}>
          {createReportMutation.isPending ? "提交中…" : "提交举报"}
        </button>
      </form>
    </main>
  );
}

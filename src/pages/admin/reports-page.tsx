import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useDeletePostMutation } from "../../features/admin/use-delete-post-mutation";
import { useDismissReportMutation } from "../../features/admin/use-dismiss-report-mutation";
import { useReportsQuery } from "../../features/admin/use-reports-query";
import { useResolveReportMutation } from "../../features/admin/use-resolve-report-mutation";
import {
  type AdminReportListItem,
  REPORT_REASON_OPTIONS
} from "../../repositories/reports-repository";
import { formatPublishedAt } from "../../utils/format";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";
const NOTE_REQUIRED_MESSAGE = "请填写处理说明。";
const DELETE_REASON_REQUIRED_MESSAGE = "请填写删除原因。";
// 处理举报成功，但紧接着的删帖失败——这是"举报"和"删帖"两个各自独立原子
// 的操作串联起来才会出现的新情况，不能用通用的 GENERIC_ERROR_MESSAGE
// （会让管理员误以为举报处理本身失败了、这一行没变化，实际上举报这一步
// 已经成功、这一行马上就要从列表消失），需要一条单独的文案说清楚"举报
// 处理好了，但删帖没成功，需要另外去补"。
const PARTIAL_DELETE_FAILURE_MESSAGE =
  "举报已处理，但删除帖子失败，请稍后前往「全部帖子」页面重试删除。";

// 复用 reports-repository.ts 里已经定义好的中文文案，不在这里重复维护一份。
const REASON_LABELS: Record<string, string> = Object.fromEntries(
  REPORT_REASON_OPTIONS.map((option) => [option.value, option.label])
);

// 跟 reports.status 的 check 约束（reports_status_check）取值一致，默认
// "pending"——这是"如果复杂就先只做 pending 列表"里判断下来的低成本可选项，
// 一个 <select> 驱动查询的 status 参数，不做更复杂的东西。
const STATUS_FILTER_OPTIONS = [
  { value: "pending", label: "待处理" },
  { value: "reviewing", label: "处理中" },
  { value: "resolved", label: "已处理" },
  { value: "dismissed", label: "已驳回" }
] as const;

type PendingAction = "resolve" | "dismiss";

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * 管理员举报处理队列（/admin/reports）。整体结构、"本地列表 + 处理后直接
 * 移除这一行"、"每行独立的进行中/展开状态"，都跟 pending-posts-page.tsx
 * 保持同样的模式，方便以后一起维护。这两处目前没有抽出共用组件——两个
 * 页面的行内输入表单只有几行 JSX，抽象出一个共享组件带来的间接层比它省下
 * 的重复更麻烦，等以后出现第三个类似场景再考虑。
 *
 * "同时删除该帖子"：产品明确要求在举报处理表单上加一个可选的删帖入口，
 * 减少管理员来回切换到 /admin/posts/all 的操作。这里刻意不新建一个
 * "resolve-and-delete"数据库函数——resolveReport/dismissReport 和
 * deletePost 各自已经是独立原子的（状态变更 + 审计日志各自在自己的
 * security definer 函数里一次完成），从 UI 层顺序调用两个已经原子的操作
 * 不需要第三个数据库原语来保证"更大的原子性"，产品这次要的只是操作上的
 * 便利，不是新的后端一致性保证。删帖原因单独用一个输入框收集，不复用
 * 处理说明（resolutionNote）——两条审计日志（resolve_report/dismiss_report
 * 一条，archive_post 一条）各自独立有意义，理由不应该被强行合并成一份。
 *
 * 失败处理是顺序调用带来的一个新分支：如果 resolveReport/dismissReport
 * 失败，跟今天完全一样（这一行还在、错误提示、处理说明保留）；如果
 * resolveReport/dismissReport 成功但紧接着的 deletePost 失败，举报处理
 * 本身已经是既成事实，这一行还是要移除，但要用一条独立的、页面级的提示
 * 说明"举报处理好了，删帖没成功"——不能既不移除这一行（举报明明已经处理
 * 成功了），也不能什么都不提示（管理员会以为帖子真的被删了）。这条提示
 * 挂在页面级而不是行内，因为这一行马上就要消失，没法承载一条持续展示的
 * 行内错误。
 */
export function AdminReportsPage() {
  const [status, setStatus] = useState<string>("pending");
  const { data, isPending, isError } = useReportsQuery(status);
  const resolveMutation = useResolveReportMutation();
  const dismissMutation = useDismissReportMutation();
  const deletePostMutation = useDeletePostMutation();

  const [reports, setReports] = useState<AdminReportListItem[] | null>(null);
  const [actioningReportId, setActioningReportId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [openFormRowId, setOpenFormRowId] = useState<string | null>(null);
  const [openFormAction, setOpenFormAction] = useState<PendingAction | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [deleteChecked, setDeleteChecked] = useState<Record<string, boolean>>({});
  const [deleteReasonDrafts, setDeleteReasonDrafts] = useState<Record<string, string>>(
    {}
  );
  const [deleteValidationErrors, setDeleteValidationErrors] = useState<
    Record<string, string>
  >({});
  const [partialFailureMessage, setPartialFailureMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (data && reports === null) {
      setReports(data);
    }
  }, [data, reports]);

  function handleStatusChange(nextStatus: string): void {
    setStatus(nextStatus);
    // 切换状态相当于切到一个全新的列表（不同的 queryKey），本地列表也要
    // 跟着重置，否则会在新状态下继续展示上一个状态过滤出来的旧行。
    setReports(null);
    setOpenFormRowId(null);
    setOpenFormAction(null);
    setRowErrors({});
    setValidationErrors({});
    setNoteDrafts({});
    setDeleteChecked({});
    setDeleteReasonDrafts({});
    setDeleteValidationErrors({});
    setPartialFailureMessage(null);
  }

  function removeReport(reportId: string): void {
    setReports((prev) => (prev ?? []).filter((report) => report.id !== reportId));
  }

  function openForm(reportId: string, action: PendingAction): void {
    setOpenFormRowId(reportId);
    setOpenFormAction(action);
    setValidationErrors((prev) => withoutKey(prev, reportId));
    setDeleteValidationErrors((prev) => withoutKey(prev, reportId));
    setPartialFailureMessage(null);
  }

  function cancelForm(reportId: string): void {
    setOpenFormRowId((current) => (current === reportId ? null : current));
    setOpenFormAction(null);
  }

  async function handleConfirm(reportId: string, action: PendingAction): Promise<void> {
    const note = (noteDrafts[reportId] ?? "").trim();
    const shouldDeletePost = deleteChecked[reportId] ?? false;
    const deleteReason = (deleteReasonDrafts[reportId] ?? "").trim();

    let hasValidationError = false;

    if (!note) {
      setValidationErrors((prev) => ({ ...prev, [reportId]: NOTE_REQUIRED_MESSAGE }));
      hasValidationError = true;
    } else {
      setValidationErrors((prev) => withoutKey(prev, reportId));
    }

    if (shouldDeletePost && !deleteReason) {
      setDeleteValidationErrors((prev) => ({
        ...prev,
        [reportId]: DELETE_REASON_REQUIRED_MESSAGE
      }));
      hasValidationError = true;
    } else {
      setDeleteValidationErrors((prev) => withoutKey(prev, reportId));
    }

    if (hasValidationError) {
      return;
    }

    setRowErrors((prev) => withoutKey(prev, reportId));
    setPartialFailureMessage(null);
    setActioningReportId(reportId);
    try {
      if (action === "resolve") {
        await resolveMutation.mutateAsync({ reportId, resolutionNote: note });
      } else {
        await dismissMutation.mutateAsync({ reportId, resolutionNote: note });
      }

      // 举报处理（resolve/dismiss）这一步已经成功——不管接下来的删帖是否
      // 还要做、做不做得成，这一行都要从列表移除，因为举报处理本身已经是
      // 既成事实。
      if (shouldDeletePost) {
        const report = (reports ?? []).find((item) => item.id === reportId);
        try {
          if (report) {
            await deletePostMutation.mutateAsync({
              postId: report.targetId,
              deleteReason
            });
          }
        } catch {
          removeReport(reportId);
          setOpenFormRowId((current) => (current === reportId ? null : current));
          setOpenFormAction(null);
          setNoteDrafts((prev) => withoutKey(prev, reportId));
          setDeleteChecked((prev) => withoutKey(prev, reportId));
          setDeleteReasonDrafts((prev) => withoutKey(prev, reportId));
          setPartialFailureMessage(PARTIAL_DELETE_FAILURE_MESSAGE);
          return;
        }
      }

      removeReport(reportId);
      setOpenFormRowId((current) => (current === reportId ? null : current));
      setOpenFormAction(null);
      setNoteDrafts((prev) => withoutKey(prev, reportId));
      setDeleteChecked((prev) => withoutKey(prev, reportId));
      setDeleteReasonDrafts((prev) => withoutKey(prev, reportId));
    } catch {
      // 提交失败时特意不清空 noteDrafts / deleteReasonDrafts，保留管理员
      // 已经输入的内容。
      setRowErrors((prev) => ({ ...prev, [reportId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningReportId(null);
    }
  }

  const statusFilter = (
    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
      状态
      <select
        value={status}
        onChange={(event) => handleStatusChange(event.target.value)}
        className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {STATUS_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const partialFailureBanner = partialFailureMessage ? (
    <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
      {partialFailureMessage}
    </p>
  ) : null;

  if (isPending) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">举报处理</h1>
        {statusFilter}
        {partialFailureBanner}
        <p role="status" className="text-sm text-text-muted">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">举报处理</h1>
        {statusFilter}
        {partialFailureBanner}
        <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          举报加载失败，请稍后重试。
        </p>
      </main>
    );
  }

  const visibleReports = reports ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">举报处理</h1>
      {statusFilter}
      {partialFailureBanner}
      {visibleReports.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">暂无举报</p>
      ) : (
        <ul>
          {visibleReports.map((report) => {
            const isActioning = actioningReportId === report.id;
            const isFormOpen = openFormRowId === report.id;

            return (
              <li key={report.id} className="mb-2 rounded-lg border border-border bg-white p-4">
                <span className="mr-3 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
                  {REASON_LABELS[report.reasonCode] ?? report.reasonCode}
                </span>
                <span className="mr-3 break-words text-sm text-text">{report.reporterName}</span>
                <span className="mr-3 break-words text-sm text-text-muted">
                  {report.targetType === "post" ? (
                    <Link to={`/post/${report.targetId}`} className="text-primary hover:underline">
                      {report.targetType} / {report.targetId}
                    </Link>
                  ) : (
                    `${report.targetType} / ${report.targetId}`
                  )}
                </span>
                <span className="mr-3 text-sm text-text-muted">{formatPublishedAt(report.createdAt)}</span>
                {rowErrors[report.id] ? (
                  <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                    {rowErrors[report.id]}
                  </p>
                ) : null}
                {isFormOpen ? null : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => openForm(report.id, "resolve")}
                      className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      标记已处理
                    </button>
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => openForm(report.id, "dismiss")}
                      className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      驳回举报
                    </button>
                  </div>
                )}
                {isFormOpen ? (
                  <div className="mt-3 rounded border border-border bg-bg p-3">
                    {validationErrors[report.id] ? (
                      <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                        {validationErrors[report.id]}
                      </p>
                    ) : null}
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      处理说明
                      <input
                        type="text"
                        value={noteDrafts[report.id] ?? ""}
                        onChange={(event) =>
                          setNoteDrafts((prev) => ({
                            ...prev,
                            [report.id]: event.target.value
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    {report.targetType === "post" ? (
                      <div>
                        <label className="mb-2 flex items-center gap-2 text-sm text-text">
                          <input
                            type="checkbox"
                            checked={deleteChecked[report.id] ?? false}
                            onChange={(event) =>
                              setDeleteChecked((prev) => ({
                                ...prev,
                                [report.id]: event.target.checked
                              }))
                            }
                            disabled={isActioning}
                            className="accent-primary"
                          />
                          同时删除该帖子
                        </label>
                        {deleteChecked[report.id] ? (
                          <>
                            {deleteValidationErrors[report.id] ? (
                              <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                                {deleteValidationErrors[report.id]}
                              </p>
                            ) : null}
                            <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                              删除原因
                              <input
                                type="text"
                                value={deleteReasonDrafts[report.id] ?? ""}
                                onChange={(event) =>
                                  setDeleteReasonDrafts((prev) => ({
                                    ...prev,
                                    [report.id]: event.target.value
                                  }))
                                }
                                disabled={isActioning}
                                className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </label>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() =>
                          handleConfirm(report.id, openFormAction as PendingAction)
                        }
                        className={
                          openFormAction === "resolve"
                            ? "rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                            : "rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                        }
                      >
                        {openFormAction === "resolve" ? "确认标记已处理" : "确认驳回举报"}
                      </button>
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => cancelForm(report.id)}
                        className="rounded border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

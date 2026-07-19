import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

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
 */
export function AdminReportsPage() {
  const [status, setStatus] = useState<string>("pending");
  const { data, isPending, isError } = useReportsQuery(status);
  const resolveMutation = useResolveReportMutation();
  const dismissMutation = useDismissReportMutation();

  const [reports, setReports] = useState<AdminReportListItem[] | null>(null);
  const [actioningReportId, setActioningReportId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [openFormRowId, setOpenFormRowId] = useState<string | null>(null);
  const [openFormAction, setOpenFormAction] = useState<PendingAction | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

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
  }

  function removeReport(reportId: string): void {
    setReports((prev) => (prev ?? []).filter((report) => report.id !== reportId));
  }

  function openForm(reportId: string, action: PendingAction): void {
    setOpenFormRowId(reportId);
    setOpenFormAction(action);
    setValidationErrors((prev) => withoutKey(prev, reportId));
  }

  function cancelForm(reportId: string): void {
    setOpenFormRowId((current) => (current === reportId ? null : current));
    setOpenFormAction(null);
  }

  async function handleConfirm(reportId: string, action: PendingAction): Promise<void> {
    const note = (noteDrafts[reportId] ?? "").trim();
    if (!note) {
      setValidationErrors((prev) => ({ ...prev, [reportId]: NOTE_REQUIRED_MESSAGE }));
      return;
    }

    setValidationErrors((prev) => withoutKey(prev, reportId));
    setRowErrors((prev) => withoutKey(prev, reportId));
    setActioningReportId(reportId);
    try {
      if (action === "resolve") {
        await resolveMutation.mutateAsync({ reportId, resolutionNote: note });
      } else {
        await dismissMutation.mutateAsync({ reportId, resolutionNote: note });
      }
      removeReport(reportId);
      setOpenFormRowId((current) => (current === reportId ? null : current));
      setOpenFormAction(null);
      setNoteDrafts((prev) => withoutKey(prev, reportId));
    } catch {
      // 失败时保留已输入的处理说明，不清空 noteDrafts。
      setRowErrors((prev) => ({ ...prev, [reportId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningReportId(null);
    }
  }

  const statusFilter = (
    <label>
      状态
      <select value={status} onChange={(event) => handleStatusChange(event.target.value)}>
        {STATUS_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  if (isPending) {
    return (
      <main>
        <h1>举报处理</h1>
        {statusFilter}
        <p role="status">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <h1>举报处理</h1>
        {statusFilter}
        <p role="alert">举报加载失败，请稍后重试。</p>
      </main>
    );
  }

  const visibleReports = reports ?? [];

  return (
    <main>
      <h1>举报处理</h1>
      {statusFilter}
      {visibleReports.length === 0 ? (
        <p role="status">暂无举报</p>
      ) : (
        <ul>
          {visibleReports.map((report) => {
            const isActioning = actioningReportId === report.id;
            const isFormOpen = openFormRowId === report.id;

            return (
              <li key={report.id}>
                <span>{REASON_LABELS[report.reasonCode] ?? report.reasonCode}</span>
                <span>{report.reporterName}</span>
                <span>
                  {report.targetType === "post" ? (
                    <Link to={`/post/${report.targetId}`}>
                      {report.targetType} / {report.targetId}
                    </Link>
                  ) : (
                    `${report.targetType} / ${report.targetId}`
                  )}
                </span>
                <span>{formatPublishedAt(report.createdAt)}</span>
                {rowErrors[report.id] ? <p role="alert">{rowErrors[report.id]}</p> : null}
                {isFormOpen ? (
                  <div>
                    {validationErrors[report.id] ? (
                      <p role="alert">{validationErrors[report.id]}</p>
                    ) : null}
                    <label>
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
                      />
                    </label>
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() =>
                        handleConfirm(report.id, openFormAction as PendingAction)
                      }
                    >
                      {openFormAction === "resolve" ? "确认标记已处理" : "确认驳回举报"}
                    </button>
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => cancelForm(report.id)}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => openForm(report.id, "resolve")}
                    >
                      标记已处理
                    </button>
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => openForm(report.id, "dismiss")}
                    >
                      驳回举报
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

import { useEffect, useState } from "react";

import { AdminNav } from "../../components/admin-nav";
import { TopBar } from "../../components/top-bar";
import { useAdminFeedbackQuery } from "../../features/admin/use-admin-feedback-query";
import { useSetFeedbackStatusMutation } from "../../features/admin/use-set-feedback-status-mutation";
import { type AdminFeedbackListItem, FEEDBACK_TYPE_OPTIONS } from "../../repositories/feedback-repository";
import { formatPublishedAt } from "../../utils/format";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";

// 复用 feedback-repository.ts 里已经定义好的中文文案，不在这里重复维护
// 一份——跟 reports-page.tsx 的 REASON_LABELS 是同一个模式。
const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  FEEDBACK_TYPE_OPTIONS.map((option) => [option.value, option.label])
);

// 跟 feedback.status 的 check 约束（feedback_status_check）取值一致，默认
// "pending"——同时也是每一行"标记为其它状态"按钮的文案来源（见下面
// STATUS_ACTION_LABEL 的用法），不单独再维护一份文案映射。
const STATUS_FILTER_OPTIONS = [
  { value: "pending", label: "待处理" },
  { value: "in_progress", label: "处理中" },
  { value: "resolved", label: "已解决" },
  { value: "closed", label: "已关闭" }
] as const;

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_FILTER_OPTIONS.map((option) => [option.value, option.label])
);

/**
 * 管理员"联系客服"处理队列（/admin/feedback）。整体结构、"本地列表 + 处理后
 * 直接移除这一行"、"每行独立的进行中状态"，照抄 reports-page.tsx——这是
 * 一个"处理到清空"的队列页面，不是 admin/users-page.tsx 那种"账号管理
 * 列表"（那种列表处理完一个账号，这个账号本身还应该继续留在列表里）。
 *
 * 跟 reports-page.tsx 的举报处理不同，这里的状态变更是"点按钮直接生效"的
 * 一步操作，没有"打开表单填处理说明再确认"这个中间态——feedback 表没有
 * resolution_note 这种字段，产品也没有要求这一步必须填理由，照抄举报处理
 * 那套两步交互只会让这个本来更简单的场景变复杂。
 *
 * 每一行展示当前状态之外的其它三个状态各一个操作按钮（比如当前是 pending
 * 的行，展示"标记处理中/标记已解决/标记已关闭"三个按钮）——按钮本身就是
 * "点了就是要切到这个状态"的最终确认，不需要额外的二次确认弹层。
 */
export function AdminFeedbackPage() {
  const [status, setStatus] = useState<string>("pending");
  const { data, isPending, isError } = useAdminFeedbackQuery(status);
  const setStatusMutation = useSetFeedbackStatusMutation();

  const [feedbackList, setFeedbackList] = useState<AdminFeedbackListItem[] | null>(null);
  const [actioningFeedbackId, setActioningFeedbackId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data && feedbackList === null) {
      setFeedbackList(data);
    }
  }, [data, feedbackList]);

  function handleStatusChange(nextStatus: string): void {
    setStatus(nextStatus);
    // 切换状态相当于切到一个全新的列表（不同的 queryKey），本地列表也要
    // 跟着重置，否则会在新状态下继续展示上一个状态过滤出来的旧行——跟
    // reports-page.tsx 的 handleStatusChange 是同一个原因。
    setFeedbackList(null);
    setRowErrors({});
  }

  function removeFeedback(feedbackId: string): void {
    setFeedbackList((prev) => (prev ?? []).filter((item) => item.id !== feedbackId));
  }

  async function handleMarkStatus(feedbackId: string, newStatus: string): Promise<void> {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[feedbackId];
      return next;
    });
    setActioningFeedbackId(feedbackId);
    try {
      await setStatusMutation.mutateAsync({ feedbackId, newStatus });
      removeFeedback(feedbackId);
    } catch {
      setRowErrors((prev) => ({ ...prev, [feedbackId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningFeedbackId(null);
    }
  }

  const statusFilter = (
    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
      状态
      <select
        value={status}
        onChange={(event) => handleStatusChange(event.target.value)}
        className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
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
        <TopBar variant="nav-only" title="联系客服" />
        <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
          <AdminNav />
          {statusFilter}
          <p role="status" className="text-sm text-text-muted">加载中…</p>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <TopBar variant="nav-only" title="联系客服" />
        <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
          <AdminNav />
          {statusFilter}
          <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            反馈加载失败，请稍后重试。
          </p>
        </div>
      </main>
    );
  }

  const visibleFeedback = feedbackList ?? [];

  return (
    <main>
      <TopBar variant="nav-only" title="联系客服" />
      <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
      <AdminNav />
      {statusFilter}
      {visibleFeedback.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">暂无反馈</p>
      ) : (
        <ul>
          {visibleFeedback.map((item) => {
            const isActioning = actioningFeedbackId === item.id;
            const otherStatuses = STATUS_FILTER_OPTIONS.filter(
              (option) => option.value !== item.status
            );

            return (
              <li key={item.id} className="mb-2 rounded-lg border border-border bg-white p-4">
                <span className="mr-3 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
                  {TYPE_LABELS[item.type] ?? item.type}
                </span>
                <span className="mr-3 break-words text-sm font-medium text-text">{item.title}</span>
                <span className="mr-3 break-words text-sm text-text-muted">{item.submitterName}</span>
                <span className="mr-3 text-sm text-text-muted">{formatPublishedAt(item.createdAt)}</span>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text">{item.content}</p>
                {item.images.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.images.map((image) => (
                      <img
                        key={image.id}
                        src={image.publicUrl}
                        alt="反馈截图"
                        className="h-16 w-16 rounded object-cover"
                      />
                    ))}
                  </div>
                ) : null}
                {rowErrors[item.id] ? (
                  <p role="alert" className="mb-2 mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                    {rowErrors[item.id]}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {otherStatuses.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isActioning}
                      onClick={() => handleMarkStatus(item.id, option.value)}
                      className="rounded border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      标记{STATUS_LABELS[option.value]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </main>
  );
}

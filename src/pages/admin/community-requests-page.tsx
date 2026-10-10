import { useState } from "react";
import { Link } from "react-router-dom";

import { AdminNav } from "../../components/admin-nav";
import { ReasonSheet } from "../../components/reason-sheet";
import { TopBar } from "../../components/top-bar";
import { useAdminCommunityRequestsQuery } from "../../features/admin/use-admin-community-requests-query";
import {
  useAdminApproveCommunityMutation,
  useAdminRejectCommunityMutation
} from "../../features/admin/use-admin-review-community-mutations";
import type { CommunityRequestStatus } from "../../repositories/community-repository";
import { formatPublishedAt } from "../../utils/format";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";
const REJECT_REASON_REQUIRED_MESSAGE = "请填写驳回原因。";

const STATUS_FILTER_OPTIONS: { value: CommunityRequestStatus; label: string }[] = [
  { value: "pending", label: "待审核" },
  { value: "active", label: "已通过" },
  { value: "rejected", label: "已驳回" }
];

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: "待审核", className: "bg-warning/10 text-warning" },
  active: { label: "已通过", className: "bg-success/10 text-success" },
  rejected: { label: "已驳回", className: "bg-danger/10 text-danger" },
  archived: { label: "已下线", className: "bg-bg text-text-muted" }
};

/**
 * 管理后台"社区申请"（/admin/communities，RequireAdmin 包裹）。普通用户在
 * /community/create 提交的社区申请在这里审核：
 * - 默认看"待审核"，按提交时间升序（先来先审），也可以切到"已通过"/"已驳回"
 *   查看历史；
 * - 通过：admin_approve_community，社区上线、申请人以 owner 身份自动加入（这一版
 *   社区主没有管理权限），并给申请人发系统通知；
 * - 驳回：原因必填（ReasonSheet，跟帖子驳回/下架同一个底部表单），原因会写进给
 *   申请人的系统通知。
 * 管理后台页面的结构（TopBar nav-only + AdminNav + 胶囊筛选 + 行内操作）跟
 * all-posts-page.tsx 保持一致。
 */
export function AdminCommunityRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<CommunityRequestStatus>("pending");
  const { data, isPending, isError } = useAdminCommunityRequestsQuery(statusFilter);
  const approve = useAdminApproveCommunityMutation();
  const reject = useAdminRejectCommunityMutation();

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  function setRowError(id: string, message: string | null): void {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  async function handleApprove(id: string): Promise<void> {
    setRowError(id, null);
    setActioningId(id);
    try {
      await approve.mutateAsync(id);
    } catch {
      setRowError(id, GENERIC_ERROR_MESSAGE);
    } finally {
      setActioningId(null);
    }
  }

  function openReject(id: string): void {
    setRejectingId(id);
    setRejectReason("");
    setRejectError(null);
    setRowError(id, null);
  }

  async function handleConfirmReject(): Promise<void> {
    if (!rejectingId) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError(REJECT_REASON_REQUIRED_MESSAGE);
      return;
    }
    const id = rejectingId;
    setRejectError(null);
    setActioningId(id);
    try {
      await reject.mutateAsync({ communityId: id, rejectionNote: reason });
      setRejectingId(null);
      setRejectReason("");
    } catch {
      // 失败时保留已填写的原因，跟其它管理页"失败不丢用户输入"一致。
      setRejectError(GENERIC_ERROR_MESSAGE);
    } finally {
      setActioningId(null);
    }
  }

  const chipInactiveClassName =
    "flex h-8 shrink-0 items-center justify-center rounded-full border border-border bg-bg px-3 text-sm whitespace-nowrap text-text-muted";
  const chipActiveClassName =
    "flex h-8 shrink-0 items-center justify-center rounded-full px-3 text-sm whitespace-nowrap bg-primary font-semibold text-white";

  const requests = data ?? [];
  const rejectingRequest = requests.find((request) => request.id === rejectingId);

  function renderList() {
    if (isPending) return <p role="status" className="text-sm text-text-muted">加载中…</p>;
    if (isError) {
      return (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          社区申请加载失败，请稍后重试。
        </p>
      );
    }
    if (requests.length === 0) {
      return <p role="status" className="text-sm text-text-muted">暂无社区申请</p>;
    }
    return (
      <ul>
        {requests.map((request) => {
          const badge = STATUS_BADGES[request.status] ?? STATUS_BADGES.pending;
          const isActioning = actioningId === request.id;
          return (
            <li key={request.id} className="mb-2 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {request.status === "active" ? (
                  <Link
                    to={`/community/${request.slug}`}
                    className="break-words text-sm font-medium text-text hover:text-primary hover:underline"
                  >
                    {request.name}
                  </Link>
                ) : (
                  <span className="break-words text-sm font-medium text-text">{request.name}</span>
                )}
                <span className="text-sm text-text-muted">{request.creatorName}</span>
                <span className="text-sm text-text-muted">{request.stateCodes.join(" / ")}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                  {badge.label}
                </span>
                <span className="text-sm text-text-muted">{formatPublishedAt(request.createdAt)}</span>
              </div>
              {request.description ? (
                <p className="mt-2 break-words text-sm text-text-body">{request.description}</p>
              ) : null}
              {request.status === "rejected" && request.rejectionReason ? (
                <p className="mt-2 rounded bg-bg px-2 py-1 text-xs text-text-muted">
                  驳回原因：{request.rejectionReason}
                </p>
              ) : null}
              {rowErrors[request.id] ? (
                <p role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                  {rowErrors[request.id]}
                </p>
              ) : null}
              {request.status === "pending" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => void handleApprove(request.id)}
                    className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isActioning && rejectingId !== request.id ? "处理中…" : "通过"}
                  </button>
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => openReject(request.id)}
                    className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    驳回
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <main>
      <TopBar variant="nav-only" title="社区申请" />
      <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <AdminNav />
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={statusFilter === option.value}
              onClick={() => {
                setStatusFilter(option.value);
                setRowErrors({});
                setRejectingId(null);
              }}
              className={statusFilter === option.value ? chipActiveClassName : chipInactiveClassName}
            >
              {option.label}
            </button>
          ))}
        </div>
        {renderList()}
      </div>
      {rejectingRequest ? (
        <ReasonSheet
          title="驳回社区申请"
          targetLabel={rejectingRequest.name}
          reasonLabel="驳回原因（会通知申请人）"
          reasonValue={rejectReason}
          onReasonChange={setRejectReason}
          errorMessage={rejectError}
          confirmLabel="确认驳回"
          destructive
          pending={actioningId === rejectingRequest.id}
          onConfirm={() => void handleConfirmReject()}
          onClose={() => setRejectingId(null)}
        />
      ) : null}
    </main>
  );
}

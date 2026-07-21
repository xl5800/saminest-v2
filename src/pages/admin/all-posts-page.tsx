import { useEffect, useState } from "react";

import { useAllPostsQuery } from "../../features/admin/use-all-posts-query";
import { useDeletePostMutation } from "../../features/admin/use-delete-post-mutation";
import type { AdminPostListItem } from "../../repositories/posts-repository";
import { formatPublishedAt } from "../../utils/format";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";
const DELETE_REASON_REQUIRED_MESSAGE = "请填写删除原因。";

// value === "" 表示"全部"，不带 status 过滤条件传给 listAllPosts；其余取值
// 是产品明确要求的三个可选项（pending/approved/rejected）。
const STATUS_FILTER_OPTIONS = [
  { value: "", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" }
] as const;

// 覆盖 posts.status 约束里现实中会出现的所有取值（不止过滤器上那三个可选
// 项——过滤器只暴露产品要求的三个，但列表本身默认"全部"时 draft/archived
// 的帖子也会出现在行里，标签要能覆盖到，不能显示成裸的英文枚举值）。
const STATUS_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  draft: "草稿",
  archived: "已归档"
};

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * 管理员"全部帖子"管理列表（/admin/posts/all）。跟 pending-posts-page.tsx
 * 是两个独立页面，故意不合并：那边是"待审核队列"（oldest-first，处理完
 * 就从队列消失，产品要求"最早发的先处理"）；这边是面向已经上线运营的
 * "浏览/管理所有帖子"（listAllPosts newest-first，可按状态筛选，每行只有
 * 一个"删除"动作）。
 *
 * 整体结构、"服务端数据只在第一次拿到时同步进本地 state（data && posts
 * === null 才 setPosts）避免后台重新 fetch 覆盖掉已经在本地移除的行"、
 * "每行独立维护展开/草稿/校验错误/进行中状态"，都跟 pending-posts-page.tsx /
 * reports-page.tsx 保持同样的模式，方便一起维护。
 */
export function AdminAllPostsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data, isPending, isError } = useAllPostsQuery(
    statusFilter === "" ? undefined : statusFilter
  );
  const deleteMutation = useDeletePostMutation();

  const [posts, setPosts] = useState<AdminPostListItem[] | null>(null);
  const [actioningPostId, setActioningPostId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [openDeleteRowId, setOpenDeleteRowId] = useState<string | null>(null);
  const [deleteReasons, setDeleteReasons] = useState<Record<string, string>>({});
  const [deleteValidationErrors, setDeleteValidationErrors] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (data && posts === null) {
      setPosts(data);
    }
  }, [data, posts]);

  function handleStatusFilterChange(nextStatus: string): void {
    setStatusFilter(nextStatus);
    // 切换过滤器相当于切到一份新的列表（不同 queryKey），本地列表也要跟着
    // 重置，否则会在新过滤条件下继续展示上一个过滤条件下的旧行——跟
    // reports-page.tsx 的 handleStatusChange 是同一个原因。
    setPosts(null);
    setOpenDeleteRowId(null);
    setRowErrors({});
    setDeleteValidationErrors({});
    setDeleteReasons({});
  }

  function removePost(postId: string): void {
    setPosts((prev) => (prev ?? []).filter((post) => post.id !== postId));
  }

  function openDeleteForm(postId: string): void {
    setOpenDeleteRowId(postId);
    setDeleteValidationErrors((prev) => withoutKey(prev, postId));
  }

  function cancelDeleteForm(postId: string): void {
    setOpenDeleteRowId((current) => (current === postId ? null : current));
  }

  async function handleConfirmDelete(postId: string): Promise<void> {
    const reason = (deleteReasons[postId] ?? "").trim();
    if (!reason) {
      setDeleteValidationErrors((prev) => ({
        ...prev,
        [postId]: DELETE_REASON_REQUIRED_MESSAGE
      }));
      return;
    }

    setDeleteValidationErrors((prev) => withoutKey(prev, postId));
    setRowErrors((prev) => withoutKey(prev, postId));
    setActioningPostId(postId);
    try {
      await deleteMutation.mutateAsync({ postId, deleteReason: reason });
      removePost(postId);
      setOpenDeleteRowId((current) => (current === postId ? null : current));
      setDeleteReasons((prev) => withoutKey(prev, postId));
    } catch {
      // 提交失败时特意不清空 deleteReasons，保留管理员已经输入的删除原因，
      // 跟 pending-posts-page.tsx 的驳回原因、reports-page.tsx 的处理说明
      // 是同一个"失败不丢用户输入"原则。
      setRowErrors((prev) => ({ ...prev, [postId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningPostId(null);
    }
  }

  const statusFilterControl = (
    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
      状态
      <select
        value={statusFilter}
        onChange={(event) => handleStatusFilterChange(event.target.value)}
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
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">全部帖子</h1>
        {statusFilterControl}
        <p role="status" className="text-sm text-text-muted">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">全部帖子</h1>
        {statusFilterControl}
        <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          帖子加载失败，请稍后重试。
        </p>
      </main>
    );
  }

  const visiblePosts = posts ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">全部帖子</h1>
      {statusFilterControl}
      {visiblePosts.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">暂无帖子</p>
      ) : (
        <ul>
          {visiblePosts.map((post) => {
            const isActioning = actioningPostId === post.id;
            const isDeleteFormOpen = openDeleteRowId === post.id;
            const statusVariant =
              post.status === "approved"
                ? "bg-success/10 text-success"
                : post.status === "pending"
                  ? "bg-warning/10 text-warning"
                  : post.status === "rejected"
                    ? "bg-danger/10 text-danger"
                    : "bg-bg text-text-muted";

            return (
              <li key={post.id} className="mb-2 rounded-lg border border-border bg-white p-4">
                <span className="mr-3 break-words text-sm text-text">{post.title}</span>
                <span className="mr-3 break-words text-sm text-text-muted">{post.authorName}</span>
                <span className="mr-3 text-sm text-text-muted">{post.categoryName}</span>
                <span className={`mr-3 rounded-full px-2 py-0.5 text-xs font-medium ${statusVariant}`}>
                  {STATUS_LABELS[post.status] ?? post.status}
                </span>
                <span className="mr-3 text-sm text-text-muted">{formatPublishedAt(post.createdAt)}</span>
                {rowErrors[post.id] ? (
                  <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                    {rowErrors[post.id]}
                  </p>
                ) : null}
                {isDeleteFormOpen ? null : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => openDeleteForm(post.id)}
                      className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      删除
                    </button>
                  </div>
                )}
                {isDeleteFormOpen ? (
                  <div className="mt-3 rounded border border-border bg-bg p-3">
                    {deleteValidationErrors[post.id] ? (
                      <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                        {deleteValidationErrors[post.id]}
                      </p>
                    ) : null}
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      删除原因
                      <input
                        type="text"
                        value={deleteReasons[post.id] ?? ""}
                        onChange={(event) =>
                          setDeleteReasons((prev) => ({
                            ...prev,
                            [post.id]: event.target.value
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => handleConfirmDelete(post.id)}
                        className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        确认删除
                      </button>
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => cancelDeleteForm(post.id)}
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

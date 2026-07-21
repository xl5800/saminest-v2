import { useEffect, useState } from "react";

import { useApprovePostMutation } from "../../features/admin/use-approve-post-mutation";
import { usePendingPostsQuery } from "../../features/admin/use-pending-posts-query";
import { useRejectPostMutation } from "../../features/admin/use-reject-post-mutation";
import type { AdminPostListItem } from "../../repositories/posts-repository";
import { formatPublishedAt } from "../../utils/format";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";
const REJECTION_REASON_REQUIRED_MESSAGE = "请填写驳回原因。";

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * 管理员待审核帖子队列（/admin/posts）。
 *
 * 列表数据来自 usePendingPostsQuery，但通过/驳回成功后不依赖重新 fetch
 * 来更新 UI——产品明确要求"这条不用刷新整个页面"，这里把服务端数据同步进
 * 一份本地 state（只在第一次拿到数据时同步一次，避免后续任何后台重新
 * 请求覆盖掉已经在本地移除的行），后续的增删只操作这份本地 state。
 *
 * 每一行的操作状态（是否正在提交、驳回输入框是否展开、驳回原因草稿、
 * 行内错误）都按 postId 分别维护在几个 Record 里，不是单个全局
 * isPending/isOpen，这样一行的操作不会影响其它行的按钮可用性。
 */
export function AdminPendingPostsPage() {
  const { data, isPending, isError } = usePendingPostsQuery();
  const approveMutation = useApprovePostMutation();
  const rejectMutation = useRejectPostMutation();

  const [posts, setPosts] = useState<AdminPostListItem[] | null>(null);
  const [actioningPostId, setActioningPostId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [openRejectRowId, setOpenRejectRowId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [rejectValidationErrors, setRejectValidationErrors] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (data && posts === null) {
      setPosts(data);
    }
  }, [data, posts]);

  function removePost(postId: string) {
    setPosts((prev) => (prev ?? []).filter((post) => post.id !== postId));
  }

  async function handleApprove(postId: string): Promise<void> {
    setRowErrors((prev) => withoutKey(prev, postId));
    setActioningPostId(postId);
    try {
      await approveMutation.mutateAsync(postId);
      removePost(postId);
    } catch {
      setRowErrors((prev) => ({ ...prev, [postId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningPostId(null);
    }
  }

  function openRejectForm(postId: string): void {
    setOpenRejectRowId(postId);
    setRejectValidationErrors((prev) => withoutKey(prev, postId));
  }

  function cancelRejectForm(postId: string): void {
    setOpenRejectRowId((current) => (current === postId ? null : current));
  }

  async function handleConfirmReject(postId: string): Promise<void> {
    const reason = (rejectReasons[postId] ?? "").trim();
    if (!reason) {
      setRejectValidationErrors((prev) => ({
        ...prev,
        [postId]: REJECTION_REASON_REQUIRED_MESSAGE
      }));
      return;
    }

    setRejectValidationErrors((prev) => withoutKey(prev, postId));
    setRowErrors((prev) => withoutKey(prev, postId));
    setActioningPostId(postId);
    try {
      await rejectMutation.mutateAsync({ postId, rejectionNote: reason });
      removePost(postId);
      setOpenRejectRowId((current) => (current === postId ? null : current));
      setRejectReasons((prev) => withoutKey(prev, postId));
    } catch {
      // 提交失败时特意不清空 rejectReasons，保留管理员已经输入的驳回原因，
      // 跟 publish-page.tsx / report-post-page.tsx 一致的"失败不丢用户输入"原则。
      setRowErrors((prev) => ({ ...prev, [postId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningPostId(null);
    }
  }

  if (isPending) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">待审核帖子</h1>
        <p role="status" className="text-sm text-text-muted">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">待审核帖子</h1>
        <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          帖子加载失败，请稍后重试。
        </p>
      </main>
    );
  }

  const visiblePosts = posts ?? [];

  if (visiblePosts.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">待审核帖子</h1>
        <p role="status" className="text-sm text-text-muted">暂无待审核帖子</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">待审核帖子</h1>
      <ul>
        {visiblePosts.map((post) => {
          const isActioning = actioningPostId === post.id;
          const isRejectFormOpen = openRejectRowId === post.id;

          return (
            <li key={post.id} className="mb-2 rounded-lg border border-border bg-white p-4">
              <span className="mr-3 break-words text-sm text-text">{post.title}</span>
              <span className="mr-3 break-words text-sm text-text-muted">{post.authorName}</span>
              <span className="mr-3 text-sm text-text-muted">{post.categoryName}</span>
              <span className="mr-3 text-sm text-text-muted">{formatPublishedAt(post.createdAt)}</span>
              {rowErrors[post.id] ? (
                <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                  {rowErrors[post.id]}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isActioning}
                  onClick={() => handleApprove(post.id)}
                  className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  通过
                </button>
                {isRejectFormOpen ? null : (
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => openRejectForm(post.id)}
                    className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    驳回
                  </button>
                )}
              </div>
              {isRejectFormOpen ? (
                <div className="mt-3 rounded border border-border bg-bg p-3">
                  {rejectValidationErrors[post.id] ? (
                    <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                      {rejectValidationErrors[post.id]}
                    </p>
                  ) : null}
                  <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                    驳回原因
                    <input
                      type="text"
                      value={rejectReasons[post.id] ?? ""}
                      onChange={(event) =>
                        setRejectReasons((prev) => ({
                          ...prev,
                          [post.id]: event.target.value
                        }))
                      }
                      disabled={isActioning}
                      className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => handleConfirmReject(post.id)}
                      className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      确认驳回
                    </button>
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => cancelRejectForm(post.id)}
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
    </main>
  );
}

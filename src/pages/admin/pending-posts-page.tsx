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
      <main>
        <h1>待审核帖子</h1>
        <p role="status">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <h1>待审核帖子</h1>
        <p role="alert">帖子加载失败，请稍后重试。</p>
      </main>
    );
  }

  const visiblePosts = posts ?? [];

  if (visiblePosts.length === 0) {
    return (
      <main>
        <h1>待审核帖子</h1>
        <p role="status">暂无待审核帖子</p>
      </main>
    );
  }

  return (
    <main>
      <h1>待审核帖子</h1>
      <ul>
        {visiblePosts.map((post) => {
          const isActioning = actioningPostId === post.id;
          const isRejectFormOpen = openRejectRowId === post.id;

          return (
            <li key={post.id}>
              <span>{post.title}</span>
              <span>{post.authorName}</span>
              <span>{post.categoryName}</span>
              <span>{formatPublishedAt(post.createdAt)}</span>
              {rowErrors[post.id] ? <p role="alert">{rowErrors[post.id]}</p> : null}
              <button
                type="button"
                disabled={isActioning}
                onClick={() => handleApprove(post.id)}
              >
                通过
              </button>
              {isRejectFormOpen ? (
                <div>
                  {rejectValidationErrors[post.id] ? (
                    <p role="alert">{rejectValidationErrors[post.id]}</p>
                  ) : null}
                  <label>
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
                    />
                  </label>
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => handleConfirmReject(post.id)}
                  >
                    确认驳回
                  </button>
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => cancelRejectForm(post.id)}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isActioning}
                  onClick={() => openRejectForm(post.id)}
                >
                  驳回
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

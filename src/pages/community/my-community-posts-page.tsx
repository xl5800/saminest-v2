import { MessageSquare, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { useDeleteCommunityPostMutation } from "../../features/community/use-delete-community-post-mutation";
import { useMyCommunityPostsQuery } from "../../features/community/use-my-community-posts-query";
import type { MyCommunityPostListItem } from "../../repositories/community-repository";
import { useAuthStore } from "../../store/auth-store";
import { formatPublishedAt } from "../../utils/format";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";
const MY_COMMUNITY_POSTS_SKELETON_COUNT = 3;

/**
 * "我的社区发帖"管理页（/my-community-posts，RequireAuth 包裹，见 routes.tsx）。
 * 整体结构照抄 my-posts-page.tsx：本地 posts state 只同步一次服务端数据，
 * 删除成功后直接在本地把这一行移除、不依赖重新拉取；删除走居中
 * role="dialog" 确认弹窗。
 *
 * 比 my-posts-page.tsx 简单的地方：社区帖子没有审核队列，状态机只有"正常"和
 * "已删除"两种，所以不需要按状态配置可用操作的那张表——"查看 / 编辑 / 删除"
 * 三个操作永远都可用，删除直接是行上的按钮（不需要"更多"展开菜单）。顶部
 * 也不放"+"发布入口：社区发帖有自己独立的 /community Feed 页顶部入口。
 * 暂不展示封面缩略图（保持纯文字卡片），以后需要再单独补。
 *
 * 标题/摘要展示照抄 community-feed-page.tsx 卡片：有标题显示标题 + 摘要，没
 * 标题就把 body 当标题用。
 */
export function MyCommunityPostsPage() {
  const userId = useAuthStore((s) => s.session)?.user.id;
  const { data, isPending, isError } = useMyCommunityPostsQuery(userId);
  const deleteMutation = useDeleteCommunityPostMutation();

  const [posts, setPosts] = useState<MyCommunityPostListItem[] | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [actioningPostId, setActioningPostId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data && posts === null) {
      setPosts(data);
    }
  }, [data, posts]);

  function clearRowError(postId: string): void {
    setRowErrors((prev) => {
      if (!(postId in prev)) return prev;
      const next = { ...prev };
      delete next[postId];
      return next;
    });
  }

  async function handleConfirmDelete(postId: string): Promise<void> {
    if (!userId) return;
    clearRowError(postId);
    setActioningPostId(postId);
    try {
      await deleteMutation.mutateAsync({ id: postId, authorId: userId });
      setPosts((prev) => (prev ?? []).filter((post) => post.id !== postId));
      setConfirmDeletePostId(null);
    } catch {
      setRowErrors((prev) => ({ ...prev, [postId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningPostId(null);
    }
  }

  const topBar = <TopBar variant="nav-only" title="我的社区发帖" />;

  if (isPending) {
    return (
      <main>
        {topBar}
        <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
          <div role="status">
            <span className="sr-only">加载中…</span>
            <ul className="flex flex-col gap-3">
              {Array.from({ length: MY_COMMUNITY_POSTS_SKELETON_COUNT }).map((_, index) => (
                <li key={index} className="rounded-2xl border border-border bg-card p-3 shadow-card">
                  <Skeleton className="h-4 w-12 rounded-full" />
                  <Skeleton className="mt-2 h-4 w-4/5" />
                  <Skeleton className="mt-1.5 h-3 w-1/3" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        {topBar}
        <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
          <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            社区帖子加载失败，请稍后重试。
          </p>
        </div>
      </main>
    );
  }

  const visiblePosts = posts ?? [];

  if (visiblePosts.length === 0) {
    return (
      <main>
        {topBar}
        <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
          <p role="status" className="text-sm text-text-muted">暂无发布的社区帖子。</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      {topBar}
      <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
        <ul className="flex flex-col gap-3">
          {visiblePosts.map((post) => {
            const hasTitle = Boolean(post.title);
            const isActioning = actioningPostId === post.id;

            return (
              <li key={post.id} className="rounded-2xl border border-border bg-card p-3 shadow-card">
                {hasTitle ? (
                  <>
                    <p className="line-clamp-1 break-words text-base font-medium text-text">
                      {post.title}
                    </p>
                    <p className="mt-1 line-clamp-2 break-words text-sm text-text-muted">{post.body}</p>
                  </>
                ) : (
                  <p className="line-clamp-2 break-words text-base font-medium text-text">
                    {post.body}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
                  <span>{formatPublishedAt(post.createdAt)}</span>
                  <span aria-label={`${post.commentCount} 条评论`} className="flex items-center gap-1">
                    <MessageSquare size={12} aria-hidden="true" />
                    {post.commentCount}
                  </span>
                  <span aria-label={`${post.favoriteCount} 次收藏`} className="flex items-center gap-1">
                    <Star size={12} aria-hidden="true" />
                    {post.favoriteCount}
                  </span>
                </div>

                {rowErrors[post.id] && confirmDeletePostId !== post.id ? (
                  <p role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                    {rowErrors[post.id]}
                  </p>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  <Link
                    to={`/community/post/${post.id}`}
                    className="rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
                  >
                    查看
                  </Link>
                  <Link
                    to={`/community/post/${post.id}/edit`}
                    className="rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
                  >
                    编辑
                  </Link>
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => setConfirmDeletePostId(post.id)}
                    className="ml-auto rounded-xl border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    删除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {confirmDeletePostId ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="确认删除"
            className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
          >
            <div className="w-full max-w-xs rounded-2xl bg-card p-5 shadow-card">
              <p className="mb-4 text-base text-text">确定要删除这条帖子吗？删除后无法恢复。</p>
              {rowErrors[confirmDeletePostId] ? (
                <p role="alert" className="mb-3 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                  {rowErrors[confirmDeletePostId]}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={actioningPostId === confirmDeletePostId}
                  onClick={() => setConfirmDeletePostId(null)}
                  className="flex-1 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={actioningPostId === confirmDeletePostId}
                  onClick={() => void handleConfirmDelete(confirmDeletePostId)}
                  className="flex-1 rounded-xl border border-danger bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

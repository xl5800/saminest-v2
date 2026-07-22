import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useArchivePostMutation } from "../../features/my-posts/use-archive-post-mutation";
import { useDeleteMyPostMutation } from "../../features/my-posts/use-delete-my-post-mutation";
import { useMyPostsQuery } from "../../features/my-posts/use-my-posts-query";
import { useResubmitPostMutation } from "../../features/my-posts/use-resubmit-post-mutation";
import type { MyPostListItem } from "../../repositories/posts-repository";
import { formatPublishedAt } from "../../utils/format";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";

// 面向作者本人的状态文案，跟后台管理页（all-posts-page.tsx）用给管理员看
// 的技术性状态名（待审核/已通过/已驳回/已归档）故意不一样——那边是内部
// 审核人员在操作队列，这边是作者在看自己发布的结果，用户在方案讨论里
// 给出的是"草稿/审核中/已发布/已下架/审核未通过"这一套结果导向的措辞，
// 不是简单复用后台那一套。
const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  pending: "审核中",
  approved: "已发布",
  rejected: "审核未通过",
  archived: "已下架"
};

// 配色逻辑照抄 all-posts-page.tsx 的 statusVariant 映射（success/warning/
// danger/中性四档），不是重新发明一套新的状态配色——同一个"状态徽章"这个
// UI 概念在管理端和用户端应该长得像，只是文案不同。
function statusBadgeClassName(status: string): string {
  if (status === "approved") return "bg-success/10 text-success";
  if (status === "pending") return "bg-warning/10 text-warning";
  if (status === "rejected") return "bg-danger/10 text-danger";
  return "bg-bg text-text-muted";
}

type SecondaryAction = "archive" | "resubmit" | "delete";

interface StatusActionConfig {
  showView: boolean;
  secondary: SecondaryAction[];
}

// 按状态-操作对照表：主要操作（查看/编辑）直接显示在卡片上，不需要单独
// 配置——除了 draft 没有"查看"（草稿没有可展示的公开详情页语义）。次要
// 操作（下架/重新提交审核/删除）统一收进"更多"菜单，这里只配置每种状态
// 有哪些次要操作，顺序即菜单里的显示顺序。
const STATUS_ACTIONS: Record<string, StatusActionConfig> = {
  draft: { showView: false, secondary: ["delete"] },
  pending: { showView: true, secondary: ["delete"] },
  approved: { showView: true, secondary: ["archive", "delete"] },
  archived: { showView: true, secondary: ["resubmit", "delete"] },
  rejected: { showView: true, secondary: ["resubmit", "delete"] }
};

const SECONDARY_ACTION_LABELS: Record<SecondaryAction, string> = {
  archive: "下架",
  resubmit: "重新提交审核",
  delete: "删除"
};

/**
 * "我的发布"管理页（/my-posts，路由已在 routes.tsx 用 RequireAuth 包裹）。
 *
 * 阶段四：接上操作按钮。主要操作（查看/编辑）直接显示；次要操作（下架/
 * 重新提交审核/删除）收进每张卡片自己的"更多"菜单，用简单的行内展开
 * （点击"更多"展开一行按钮），不是浮层弹出菜单——这个仓库目前没有任何
 * 弹出层/浮层组件，行内展开是跟 all-posts-page.tsx 的删除确认表单同一个
 * 交互复杂度，不需要为这一个场景新引入一整套 popover 定位/点击外部关闭
 * 的机制。
 *
 * 删除单独做成一个真正的居中弹窗确认（role="dialog"），跟"更多"菜单的
 * 行内展开区分开——这是这个仓库第一个这样的弹窗，没有更早的组件可以复用，
 * 但只在这一个页面用，先不为了"可能以后还有地方要用"抽成共享组件（等真的
 * 出现第二个使用场景再抽，避免为假设中的未来需求设计）。
 *
 * "更多"菜单/删除弹窗只用本地 state（服务端数据只在第一次拿到时同步进
 * `posts` state），下架/重新提交/删除成功后直接在本地更新/移除对应行，
 * 不 invalidate 查询——跟 all-posts-page.tsx 的模式完全一致。
 */
export function MyPostsPage() {
  const { data, isPending, isError } = useMyPostsQuery();
  const archiveMutation = useArchivePostMutation();
  const resubmitMutation = useResubmitPostMutation();
  const deleteMutation = useDeleteMyPostMutation();

  const [posts, setPosts] = useState<MyPostListItem[] | null>(null);
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
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

  function toggleMenu(postId: string): void {
    setOpenMenuPostId((current) => (current === postId ? null : postId));
  }

  async function handleArchive(postId: string): Promise<void> {
    clearRowError(postId);
    setActioningPostId(postId);
    try {
      await archiveMutation.mutateAsync(postId);
      setPosts((prev) =>
        (prev ?? []).map((post) =>
          post.id === postId ? { ...post, status: "archived" } : post
        )
      );
      setOpenMenuPostId(null);
    } catch {
      setRowErrors((prev) => ({ ...prev, [postId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningPostId(null);
    }
  }

  async function handleResubmit(postId: string): Promise<void> {
    clearRowError(postId);
    setActioningPostId(postId);
    try {
      await resubmitMutation.mutateAsync(postId);
      setPosts((prev) =>
        (prev ?? []).map((post) =>
          post.id === postId
            ? { ...post, status: "pending", rejectionReason: null }
            : post
        )
      );
      setOpenMenuPostId(null);
    } catch {
      setRowErrors((prev) => ({ ...prev, [postId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningPostId(null);
    }
  }

  async function handleConfirmDelete(postId: string): Promise<void> {
    clearRowError(postId);
    setActioningPostId(postId);
    try {
      await deleteMutation.mutateAsync(postId);
      setPosts((prev) => (prev ?? []).filter((post) => post.id !== postId));
      setConfirmDeletePostId(null);
      setOpenMenuPostId(null);
    } catch {
      setRowErrors((prev) => ({ ...prev, [postId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningPostId(null);
    }
  }

  function handleSecondaryAction(action: SecondaryAction, postId: string): void {
    if (action === "archive") {
      void handleArchive(postId);
      return;
    }
    if (action === "resubmit") {
      void handleResubmit(postId);
      return;
    }
    // delete：不直接执行，先打开确认弹窗，真正的删除在
    // handleConfirmDelete 里，"更多"菜单先收起来，弹窗盖在上面更清楚。
    setOpenMenuPostId(null);
    setConfirmDeletePostId(postId);
  }

  if (isPending) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">我的发布</h1>
        <p role="status" className="text-sm text-text-muted">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">我的发布</h1>
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          发布列表加载失败，请稍后重试。
        </p>
      </main>
    );
  }

  const visiblePosts = posts ?? [];

  if (visiblePosts.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">我的发布</h1>
        <p role="status" className="text-sm text-text-muted">暂无发布，去发一条吧。</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">我的发布</h1>
      <ul className="flex flex-col gap-3">
        {visiblePosts.map((post) => {
          const actions = STATUS_ACTIONS[post.status] ?? {
            showView: true,
            secondary: ["delete"] as SecondaryAction[]
          };
          const isMenuOpen = openMenuPostId === post.id;
          const isActioning = actioningPostId === post.id;

          return (
            <li
              key={post.id}
              className="rounded-2xl border border-border bg-white p-3 shadow-card"
            >
              <div className="flex gap-3">
                {post.coverImageUrl ? (
                  <img
                    src={post.coverImageUrl}
                    alt={post.title}
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    data-testid="my-post-thumbnail-placeholder"
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-bg text-2xl"
                  >
                    🖼
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 break-words text-base text-text">{post.title}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClassName(post.status)}`}
                    >
                      {STATUS_LABELS[post.status] ?? post.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-text-muted">
                    {post.categoryName} · {post.locationName ?? "地区未填写"}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">{formatPublishedAt(post.createdAt)}</p>
                  {post.status === "rejected" ? (
                    <p className="mt-1 text-xs text-danger">审核未通过</p>
                  ) : null}
                </div>
              </div>

              {rowErrors[post.id] ? (
                <p role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                  {rowErrors[post.id]}
                </p>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                {actions.showView ? (
                  <Link
                    to={`/post/${post.id}`}
                    className="rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
                  >
                    查看
                  </Link>
                ) : null}
                <Link
                  to={`/publish/${post.id}`}
                  className="rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
                >
                  编辑
                </Link>
                {actions.secondary.length > 0 ? (
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => toggleMenu(post.id)}
                    className="ml-auto rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    更多
                  </button>
                ) : null}
              </div>

              {isMenuOpen ? (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
                  {actions.secondary.map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={isActioning}
                      onClick={() => handleSecondaryAction(action, post.id)}
                      className={`rounded-xl border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                        action === "delete"
                          ? "border-danger text-danger hover:bg-danger/10"
                          : "border-border text-text hover:bg-bg"
                      }`}
                    >
                      {SECONDARY_ACTION_LABELS[action]}
                    </button>
                  ))}
                </div>
              ) : null}
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
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-card">
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
                onClick={() => handleConfirmDelete(confirmDeletePostId)}
                className="flex-1 rounded-xl border border-danger bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

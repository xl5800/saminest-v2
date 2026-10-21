import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AdminNav } from "../../components/admin-nav";
import { ImageLightbox } from "../../components/image-lightbox";
import { ReasonSheet } from "../../components/reason-sheet";
import { TopBar } from "../../components/top-bar";
import { PostReviewToggle } from "../../features/admin/post-review-toggle";
import { useApprovePostMutation } from "../../features/admin/use-approve-post-mutation";
import { usePendingPostsQuery } from "../../features/admin/use-pending-posts-query";
import { useRejectPostMutation } from "../../features/admin/use-reject-post-mutation";
import type { AdminPendingPostItem } from "../../repositories/posts-repository";
import { formatLocationDisplayName } from "../../data/us-states";
import { formatPrice, formatPublishedAt, isPriceUnset } from "../../utils/format";

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

  const [posts, setPosts] = useState<AdminPendingPostItem[] | null>(null);
  const [actioningPostId, setActioningPostId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [openRejectRowId, setOpenRejectRowId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [rejectValidationErrors, setRejectValidationErrors] = useState<
    Record<string, string>
  >({});
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [expandedPostIds, setExpandedPostIds] = useState<Record<string, boolean>>({});

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
        <TopBar variant="nav-only" title="待审核帖子" />
        <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
          <AdminNav />
          <PostReviewToggle />
          <p role="status" className="text-sm text-text-muted">加载中…</p>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <TopBar variant="nav-only" title="待审核帖子" />
        <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
          <AdminNav />
          <PostReviewToggle />
          <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            帖子加载失败，请稍后重试。
          </p>
        </div>
      </main>
    );
  }

  const visiblePosts = posts ?? [];

  if (visiblePosts.length === 0) {
    return (
      <main>
        <TopBar variant="nav-only" title="待审核帖子" />
        <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
          <AdminNav />
          <PostReviewToggle />
          <p role="status" className="text-sm text-text-muted">暂无待审核帖子</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <TopBar variant="nav-only" title="待审核帖子" />
      <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
      <AdminNav />
      <PostReviewToggle />
      <ul>
        {visiblePosts.map((post) => {
          const isActioning = actioningPostId === post.id;
          const isRejectFormOpen = openRejectRowId === post.id;

          return (
            <li key={post.id} className="mb-3 rounded-lg border border-border bg-card p-3">
              {/* 审核卡片：照片横向一排（全部图片，点开全屏看），下面价格 →
                  标题 → 描述（默认 3 行，可展开）→ 分类·地区·作者·时间，
                  底部 通过 / 驳回 / 查看详情。字段顺序跟前台 Facebook 风格
                  列表一致（价格黑色粗体在最上），管理员看到的就是用户将来
                  看到的样子。 */}
              {post.imageUrls.length > 0 ? (
                <div className="-mx-3 mb-2 flex gap-1 overflow-x-auto px-3">
                  {post.imageUrls.map((url, index) => (
                    <button
                      key={url}
                      type="button"
                      aria-label={`查看第 ${index + 1} 张图片`}
                      onClick={() => setLightbox({ images: post.imageUrls, index })}
                      className="shrink-0"
                    >
                      <img
                        src={url}
                        alt=""
                        className="h-24 w-24 rounded object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mb-2 text-xs text-text-muted">没有图片</p>
              )}
              {isPriceUnset(post.priceAmount, post.priceLabel) ? null : (
                <p className="text-base font-bold text-text">
                  {formatPrice(post.priceAmount, post.priceLabel, post.currencyCode)}
                </p>
              )}
              <p className="break-words text-sm font-medium text-text">{post.title}</p>
              {post.description.trim() ? (
                <>
                  <p
                    className={`mt-1 whitespace-pre-wrap break-words text-sm text-text-muted${
                      expandedPostIds[post.id] ? "" : " line-clamp-3"
                    }`}
                  >
                    {post.description}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPostIds((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                    }
                    className="mt-0.5 text-xs text-primary"
                  >
                    {expandedPostIds[post.id] ? "收起" : "展开全文"}
                  </button>
                </>
              ) : null}
              <p className="mt-1 text-xs text-text-muted">
                {[
                  post.categoryName,
                  post.locationName ? formatLocationDisplayName(post.locationName) : null,
                  post.authorName,
                  formatPublishedAt(post.createdAt)
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
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
                  {/* 用户反馈"点了通过，这条帖子在待审核列表里呆了一会才消失"——
                      实际不是缓存问题：approveMutation.mutateAsync 成功后就立刻
                      本地 removePost，没有任何人为延迟，那"一会"就是等
                      approve_post 这个 RPC 网络往返的真实耗时，只是按钮文案一直
                      停在"通过"，看不出正在处理，体感像是卡住了。这里补一个
                      "处理中…"文案，跟 register-page.tsx/login-page.tsx 提交
                      按钮同一个套路，不改变实际耗时，但让等待有反馈。 */}
                  {isActioning ? "处理中…" : "通过"}
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
                <Link
                  to={`/post/${post.id}`}
                  className="rounded border border-border px-3 py-1.5 text-sm text-text hover:bg-bg"
                >
                  查看详情
                </Link>
              </div>
              {/* 功能改动清单第 7 项："所有需要原因的操作统一改为底部弹出
                  表单（替代原版行内展开）"——驳回原因这里原来是行内展开的
                  <input>，改成 ReasonSheet，行为（openRejectRowId 控制
                  开合、提交失败不清空 rejectReasons）没有变，只是外观从
                  行内换成底部弹层。 */}
              {isRejectFormOpen ? (
                <ReasonSheet
                  title="驳回帖子"
                  targetLabel={post.title}
                  reasonLabel="驳回原因"
                  reasonValue={rejectReasons[post.id] ?? ""}
                  onReasonChange={(value) =>
                    setRejectReasons((prev) => ({ ...prev, [post.id]: value }))
                  }
                  errorMessage={rejectValidationErrors[post.id] ?? null}
                  confirmLabel="确认驳回"
                  destructive
                  pending={isActioning}
                  onConfirm={() => handleConfirmReject(post.id)}
                  onClose={() => cancelRejectForm(post.id)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      </div>
      {lightbox ? (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </main>
  );
}

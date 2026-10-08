import { MessageCircle } from "lucide-react";
import { useParams } from "react-router-dom";

import { CommentSection } from "../../components/comment-section";
import { CommunityPostFavoriteButton } from "../../components/community-post-favorite-button";
import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { useCommunityPostDetailQuery } from "../../features/community/use-community-post-detail-query";
import { formatRelativeTimeAgo } from "../../utils/format";
import {
  COMMUNITY_POST_TYPE_PILL_CLASS_NAME,
  getCommunityPostTypeLabel
} from "./community-post-type";

/**
 * 社区帖子详情页（/community/post/:id，公开可见）。
 *
 * 展示：类型 pill、标题（有则显示）、正文（whitespace-pre-wrap 保留换行）、
 * 作者头像+昵称+相对时间（formatRelativeTimeAgo，复用 utils/format.ts 已有
 * 函数）。操作行：收藏（Star，icon 变体）+ 评论数展示；这次不做分享/举报
 * 按钮（举报功能阶段四再接）。下面挂 <CommentSection communityPostId>。
 *
 * 找不到帖子（isError，包括 .single() 查不到行、RLS 看不到）时展示"帖子不存在
 * 或已被删除"，不做额外跳转。
 */
export function CommunityPostDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: post, isPending, isError } = useCommunityPostDetailQuery(id);

  function renderContent() {
    if (isPending) {
      return (
        <div role="status">
          <span className="sr-only">加载中…</span>
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="mt-3 h-6 w-4/5" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-1.5 h-4 w-full" />
          <Skeleton className="mt-1.5 h-4 w-3/5" />
        </div>
      );
    }

    if (isError || !post) {
      return <p role="alert">帖子不存在或已被删除。</p>;
    }

    return (
      <>
        <article>
          <span className={COMMUNITY_POST_TYPE_PILL_CLASS_NAME}>
            {getCommunityPostTypeLabel(post.postType)}
          </span>
          {post.title ? (
            <h1 className="mt-2 break-words text-xl font-semibold text-text">{post.title}</h1>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            {post.authorAvatarUrl ? (
              <img
                src={post.authorAvatarUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {post.authorDisplayName.trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{post.authorDisplayName}</p>
              <p className="text-xs text-text-muted">{formatRelativeTimeAgo(post.createdAt)}</p>
            </div>
          </div>
          <p className="mt-4 whitespace-pre-wrap break-words text-base text-text">{post.body}</p>
        </article>

        <div className="mt-6 flex items-center gap-8 border-t border-divider pt-4">
          <CommunityPostFavoriteButton communityPostId={post.id} variant="icon" />
          <span
            aria-label={`${post.commentCount} 条评论`}
            className="flex flex-col items-center gap-1 text-text-muted"
          >
            <MessageCircle size={22} aria-hidden="true" />
            <span className="text-xs">{post.commentCount}</span>
          </span>
        </div>

        <div className="mt-6">
          <CommentSection communityPostId={post.id} />
        </div>
      </>
    );
  }

  return (
    <main data-testid="community-post-detail-page">
      <TopBar variant="nav-only" title="帖子详情" />
      <div className="mx-auto max-w-2xl px-4 py-4 pb-24 md:pb-6">{renderContent()}</div>
    </main>
  );
}

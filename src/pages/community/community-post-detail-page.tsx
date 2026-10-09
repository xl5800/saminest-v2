import { Clipboard } from "@capacitor/clipboard";
import { MessageCircle, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { CommentSection } from "../../components/comment-section";
import { CommunityPostFavoriteButton } from "../../components/community-post-favorite-button";
import { ImageLightbox } from "../../components/image-lightbox";
import { PostImageCarousel } from "../../components/post-image-carousel";
import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { useCommunityBySlugQuery } from "../../features/community/use-community-by-slug-query";
import { useCommunityPostDetailQuery } from "../../features/community/use-community-post-detail-query";
import { PRODUCTION_ORIGIN } from "../../utils/constants";
import { formatRelativeTimeAgo } from "../../utils/format";
import {
  COMMUNITY_POST_TYPE_PILL_CLASS_NAME,
  getCommunityPostTypeLabel
} from "./community-post-type";

interface CommunityPostDetailLocationState {
  publishSuccessMessage?: string;
}

/**
 * 社区帖子详情页（/community/post/:id，公开可见）。
 *
 * 展示：类型 pill、标题（有则显示）、正文（whitespace-pre-wrap 保留换行）、
 * 作者头像+昵称+相对时间（formatRelativeTimeAgo，复用 utils/format.ts 已有
 * 函数）。操作行（视觉改版任务卡）：三等分——评论数展示（不可点，页面
 * 本身就在评论区上方）/ 收藏（Star，icon 变体）/ 分享（Share2，点击把
 * 生产域名拼的帖子链接写入剪贴板，同 post-share-action-sheet.tsx 的复制
 * 链接用法：@capacitor/clipboard，网页端自动降级 navigator.clipboard；
 * 这里没有抽 src/utils/share.ts，跟阶段十的卡各自内联，避免两边建同名文件
 * 冲突）。顶栏 title 是"社区名 · N 位成员"（按帖子自己的 communitySlug 查所属
 * 社区，useCommunityBySlugQuery），帖子/社区还没加载出来或加载失败时退回"帖子详情"。
 * 举报入口放在顶栏 detail 变体的"…"更多菜单里（一个"举报"链接，跳
 * /community/post/:id/report，未登录由那条路由的 RequireAuth 挡回登录页）；
 * 链接用路由参数 id，不需要等帖子详情加载完。下面挂
 * <CommentSection communityPostId>。
 *
 * 找不到帖子（isError，包括 .single() 查不到行、RLS 看不到）时展示"帖子不存在
 * 或已被删除"，不做额外跳转。
 */
export function CommunityPostDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  // 发帖页在"帖子已创建、但部分图片上传失败"时带着这条提示跳转过来（跟
  // post-detail-page.tsx 读 publishSuccessMessage 是同一个 location.state 约定）。
  const publishSuccessMessage = (location.state as CommunityPostDetailLocationState | null)
    ?.publishSuccessMessage;
  const { data: post, isPending, isError } = useCommunityPostDetailQuery(id);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { data: community } = useCommunityBySlugQuery(post?.communitySlug);
  const topBarTitle = community
    ? `${community.name} · ${community.memberCount} 位成员`
    : "帖子详情";
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!copyFeedback) return;
    const timer = window.setTimeout(() => setCopyFeedback(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  async function handleShare(): Promise<void> {
    try {
      await Clipboard.write({ string: `${PRODUCTION_ORIGIN}/community/post/${id}` });
      setCopyFeedback("链接已复制");
    } catch (error) {
      // 跟 post-share-action-sheet.tsx 同一个态度：复制失败（浏览器拒绝权限
      // 之类）不是用户能纠正的场景，只留控制台日志，不弹"复制失败"。
      console.error("复制链接失败：", error);
    }
  }

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
          <p className="mt-4 whitespace-pre-wrap break-words text-[17px] leading-[1.6] text-text">
            {post.body}
          </p>
          {post.images.length > 0 ? (
            <div className="mt-4">
              <PostImageCarousel
                images={post.images}
                onImageClick={(index) => setLightboxIndex(index)}
                aspectRatio="3 / 4"
              />
            </div>
          ) : null}
        </article>

        <div className="mt-6 grid grid-cols-3 items-start border-t border-divider pt-4">
          <span
            aria-label={`${post.commentCount} 条评论`}
            className="flex flex-col items-center gap-1 text-text-muted"
          >
            <MessageCircle size={22} aria-hidden="true" />
            <span className="text-xs">{post.commentCount}</span>
          </span>
          <div className="flex justify-center">
            <CommunityPostFavoriteButton communityPostId={post.id} variant="icon" />
          </div>
          <button
            type="button"
            aria-label="分享"
            onClick={() => void handleShare()}
            className="flex flex-col items-center gap-1 text-text-muted"
          >
            <Share2 size={22} aria-hidden="true" />
            <span className="text-xs">分享</span>
          </button>
        </div>
        {copyFeedback ? (
          <p role="status" className="mt-2 text-center text-xs text-primary">
            {copyFeedback}
          </p>
        ) : null}

        <div className="mt-6">
          <CommentSection communityPostId={post.id} />
        </div>

        {lightboxIndex !== null ? (
          <ImageLightbox
            images={post.images}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <main data-testid="community-post-detail-page">
      <TopBar
        variant="detail"
        title={topBarTitle}
        moreMenu={{
          label: "更多",
          content: (
            <Link
              to={`/community/post/${id}/report`}
              className="block px-4 py-2 text-left text-sm text-text hover:bg-bg hover:text-primary"
            >
              举报
            </Link>
          )
        }}
      />
      <div className="mx-auto max-w-2xl px-4 py-4 pb-24 md:pb-6">
        {publishSuccessMessage ? (
          <p role="status" className="mb-4 text-sm text-text-muted">
            {publishSuccessMessage}
          </p>
        ) : null}
        {renderContent()}
      </div>
    </main>
  );
}

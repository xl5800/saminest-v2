import { Link } from "react-router-dom";

import {
  COMMUNITY_POST_LIST_PREVIEW_CLASS_NAME,
  COMMUNITY_POST_LIST_TITLE_CLASS_NAME
} from "../pages/community/community-post-type";
import type { CommunityPostListItem } from "../repositories/community-repository";
import { formatRelativeTimeAgo } from "../utils/format";
import { CommunityPostActionBar } from "./community-post-action-bar";
import { PostImageCarousel } from "./post-image-carousel";

interface CommunityPostCardProps {
  post: CommunityPostListItem;
  /** 首页（跨社区聚合）显示右上角的社区名标签；单个社区页里已经知道是哪个社区，
   *  不显示，那个位置改为显示"置顶"标签（如果是置顶帖）。 */
  showCommunityTag: boolean;
}

/**
 * 社区帖子列表里的一条帖子——首页和单个社区页（/community/:slug）共用，保证两边
 * 帖子预览长得完全一样（原来两边各写一份，作者行一个在上一个在下）。
 *
 * 从上到下：
 * - 作者行：头像 + 昵称 + 相对时间（整行链接到详情页）；右侧是社区名标签（首页）
 *   或"置顶"标签（社区页里的置顶帖）。作者行和社区标签是两个并列的链接，不能嵌套
 *   （<a> 里嵌 <a> 非法，点标签还会同时触发外层导航）。
 * - 内容区（整块链接到详情页）：有标题时标题 + 正文预览；没有标题时正文直接当
 *   标题用、不重复预览。文字样式来自 community-post-type.ts。图片在文字下方满宽
 *   展示（PostImageCarousel），不传 onImageClick——静止点击图片冒泡给外层 Link。
 * - 操作行（CommunityPostActionBar）：评论数 / 收藏 / 分享，放在链接外面，按钮
 *   不能嵌在 <a> 里。
 */
export function CommunityPostCard({ post, showCommunityTag }: CommunityPostCardProps) {
  const detailPath = `/community/post/${post.id}`;
  const hasTitle = Boolean(post.title);

  return (
    <article className="border-b border-divider px-4 py-4">
      <div className="flex items-center gap-2">
        <Link to={detailPath} className="flex min-w-0 flex-1 items-center gap-2">
          {post.authorAvatarUrl ? (
            <img
              src={post.authorAvatarUrl}
              alt=""
              className="h-6 w-6 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-[10px] font-semibold text-primary"
            >
              {post.authorDisplayName.trim().charAt(0).toUpperCase() || "?"}
            </span>
          )}
          <span className="min-w-0 truncate text-sm text-text">{post.authorDisplayName}</span>
          <span className="shrink-0 text-xs text-text-subtle">
            {formatRelativeTimeAgo(post.createdAt)}
          </span>
        </Link>
        {showCommunityTag && post.communitySlug ? (
          <Link
            to={`/community/${post.communitySlug}`}
            className="max-w-[45%] shrink-0 truncate rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary"
          >
            {post.communityName}
          </Link>
        ) : null}
        {!showCommunityTag && post.pinned ? (
          <span className="shrink-0 rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
            置顶
          </span>
        ) : null}
      </div>

      <Link to={detailPath} className="mt-2 block">
        <div className="min-w-0">
          {hasTitle ? (
            <>
              <p className={COMMUNITY_POST_LIST_TITLE_CLASS_NAME}>{post.title}</p>
              <p className={`mt-1 ${COMMUNITY_POST_LIST_PREVIEW_CLASS_NAME}`}>{post.body}</p>
            </>
          ) : (
            <p className={COMMUNITY_POST_LIST_TITLE_CLASS_NAME}>{post.body}</p>
          )}
        </div>
        {post.images.length > 0 ? (
          <div className="mt-3">
            <PostImageCarousel images={post.images} aspectRatio="4 / 3" />
          </div>
        ) : null}
      </Link>

      <CommunityPostActionBar
        communityPostId={post.id}
        commentCount={post.commentCount}
        favoriteCount={post.favoriteCount}
      />
    </article>
  );
}

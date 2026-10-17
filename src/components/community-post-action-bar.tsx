import { MessageCircle, Share2 } from "lucide-react";

import { buildCommunityPostShareInput } from "../features/share/community-share-input";
import { useShareLink } from "../features/share/use-share-link";
import { CommunityPostFavoriteButton } from "./community-post-favorite-button";
import { CommunityPostLikeButton } from "./community-post-like-button";

interface CommunityPostActionBarProps {
  communityPostId: string;
  commentCount: number;
  favoriteCount: number;
  /** 社区帖子点赞任务卡：点赞数，大拇指按钮放在评论左边（跟 Facebook 一样
   *  "赞"排第一个）。 */
  likeCount: number;
  /** 社区分享卡片任务卡：分享时的标题/描述用（App 原生分享面板显示）。 */
  title: string | null;
  body: string;
  communityName: string;
}

/**
 * 帖子列表（首页 / 单个社区页）每条帖子下面的操作行：评论数 / 收藏 / 分享。
 *
 * 图标跟帖子详情页的操作行是同一套——lucide 的 MessageCircle / Star / Share2
 * 线条图标、不套圆框、同一个 text-muted 颜色；列表里只放图标和数字、不放
 * "收藏""分享"文字，像 Reddit 列表一样紧凑（详情页那行图标下面带文字，空间
 * 更宽松）。原来首页收藏/分享是套着白色圆框的按钮、社区页收藏数用的是爱心，
 * 三处各不一样，统一成这一个组件。
 *
 * 分享：社区分享卡片任务卡之后跟详情页、找搭子活动一样走 useShareLink()——
 * App 里弹系统分享面板，微信里显示"点右上角转发"引导（微信卡片由
 * middleware.ts 注入的 og 标签生成），其他浏览器优先 navigator.share，不支持
 * 时复制链接并提示"链接已复制"。原来这里只复制链接。
 *
 * 这一行必须放在帖子的 <Link> 外面（按钮不能嵌在 <a> 里），调用方负责。
 */
export function CommunityPostActionBar({
  communityPostId,
  commentCount,
  favoriteCount,
  likeCount,
  title,
  body,
  communityName
}: CommunityPostActionBarProps) {
  const { share, shareUi } = useShareLink();

  function handleShare(): void {
    void share(
      buildCommunityPostShareInput({ id: communityPostId, title, body, communityName }),
      "community_post"
    );
  }

  return (
    <div className="mt-3 flex items-center gap-6 text-text-muted">
      <CommunityPostLikeButton communityPostId={communityPostId} likeCount={likeCount} />
      <span
        aria-label={`${commentCount} 条评论`}
        className="flex items-center gap-1 py-1 text-sm"
      >
        <MessageCircle aria-hidden="true" size={20} />
        {commentCount}
      </span>
      <CommunityPostFavoriteButton
        communityPostId={communityPostId}
        variant="inline"
        favoriteCount={favoriteCount}
      />
      <button
        type="button"
        aria-label="分享帖子"
        onClick={handleShare}
        className="flex items-center gap-1 py-1 text-sm"
      >
        <Share2 aria-hidden="true" size={20} />
      </button>
      {shareUi}
    </div>
  );
}

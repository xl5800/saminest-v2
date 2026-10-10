import { Clipboard } from "@capacitor/clipboard";
import { MessageCircle, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { PRODUCTION_ORIGIN } from "../utils/constants";
import { CommunityPostFavoriteButton } from "./community-post-favorite-button";

interface CommunityPostActionBarProps {
  communityPostId: string;
  commentCount: number;
  favoriteCount: number;
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
 * 分享：跟详情页一样，把生产域名拼的帖子链接写进剪贴板（@capacitor/clipboard，
 * 网页端自动降级 navigator.clipboard），成功后在图标旁显示 2 秒"链接已复制"；
 * 失败只写控制台。原来首页的分享是禁用的占位按钮，这次一起接上。
 *
 * 这一行必须放在帖子的 <Link> 外面（按钮不能嵌在 <a> 里），调用方负责。
 */
export function CommunityPostActionBar({
  communityPostId,
  commentCount,
  favoriteCount
}: CommunityPostActionBarProps) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!copyFeedback) return;
    const timer = window.setTimeout(() => setCopyFeedback(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  async function handleShare(): Promise<void> {
    try {
      await Clipboard.write({ string: `${PRODUCTION_ORIGIN}/community/post/${communityPostId}` });
      setCopyFeedback("链接已复制");
    } catch (error) {
      console.error("复制链接失败：", error);
    }
  }

  return (
    <div className="mt-3 flex items-center gap-6 text-text-muted">
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
        onClick={() => void handleShare()}
        className="flex items-center gap-1 py-1 text-sm"
      >
        <Share2 aria-hidden="true" size={20} />
      </button>
      {copyFeedback ? (
        <span role="status" className="text-xs text-primary">
          {copyFeedback}
        </span>
      ) : null}
    </div>
  );
}

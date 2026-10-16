import { ThumbsUp } from "lucide-react";
import { type MouseEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useLikedCommunityPostIdsQuery } from "../features/community/use-liked-community-post-ids-query";
import { useToggleCommunityPostLikeMutation } from "../features/community/use-toggle-community-post-like-mutation";
import { useLoginPath } from "../router/use-login-path";
import { useAuthStore } from "../store/auth-store";

export interface CommunityPostLikeButtonProps {
  communityPostId: string;
  /** 帖子当前的点赞数（community_posts.like_count）。 */
  likeCount: number;
  /** inline：帖子列表操作行（图标 + 数字横排）；icon：详情页底部操作行
   *  （图标在上、文字在下竖排，跟收藏/分享按钮一致）。 */
  variant?: "inline" | "icon";
}

/**
 * 社区帖子点赞按钮（社区帖子点赞任务卡）。图标是 Facebook 那种大拇指：
 * 没赞过是灰色描边（中间透明），赞过变成品牌蓝实心。
 *
 * - 点了立刻变色、数字 ±1，不等服务器返回；失败就恢复原样。服务器的点赞数
 *   和"我赞过哪些"刷新回来以后，以服务器为准。
 * - 点赞数为 0 时不显示"0"，只显示"赞"字（列表里）——避免满屏 0。
 * - 没登录点赞：去登录页，登录后回到当前页面。
 */
export function CommunityPostLikeButton({
  communityPostId,
  likeCount,
  variant = "inline"
}: CommunityPostLikeButtonProps) {
  const navigate = useNavigate();
  const loginPath = useLoginPath();
  const userId = useAuthStore((s) => s.session)?.user.id;
  const { data: likedIds } = useLikedCommunityPostIdsQuery();
  const toggleLike = useToggleCommunityPostLikeMutation();

  const serverLiked = Boolean(userId) && (likedIds ?? []).includes(communityPostId);
  const [liked, setLiked] = useState(serverLiked);
  const [count, setCount] = useState(likeCount);

  // 服务器数据刷新回来（或者别处改了点赞状态）时，跟服务器对齐。
  useEffect(() => setLiked(serverLiked), [serverLiked]);
  useEffect(() => setCount(likeCount), [likeCount]);

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();

    if (!userId) {
      navigate(loginPath);
      return;
    }
    if (toggleLike.isPending) return;

    const wasLiked = liked;
    setLiked(!wasLiked);
    setCount((current) => Math.max(current + (wasLiked ? -1 : 1), 0));

    toggleLike.mutate(
      { userId, communityPostId, isCurrentlyLiked: wasLiked },
      {
        onError: () => {
          setLiked(wasLiked);
          setCount((current) => Math.max(current + (wasLiked ? 1 : -1), 0));
        }
      }
    );
  }

  const label = liked ? "取消点赞" : "点赞";
  const colorClassName = liked ? "text-primary" : "text-text-muted";

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-pressed={liked}
        aria-label={label}
        onClick={handleClick}
        className={`flex flex-col items-center gap-1 ${colorClassName}`}
      >
        <ThumbsUp size={22} aria-hidden="true" fill={liked ? "currentColor" : "none"} />
        <span className="text-xs">{count > 0 ? count : "赞"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={label}
      onClick={handleClick}
      className={`flex items-center gap-1 py-1 text-sm ${colorClassName} ${liked ? "font-semibold" : ""}`}
    >
      <ThumbsUp size={20} aria-hidden="true" fill={liked ? "currentColor" : "none"} />
      <span>{count > 0 ? count : "赞"}</span>
    </button>
  );
}

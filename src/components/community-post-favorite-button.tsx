import { Star } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useCommunityPostFavoriteIdsQuery } from "../features/favorites/use-community-post-favorite-ids-query";
import { useToggleCommunityPostFavoriteMutation } from "../features/favorites/use-toggle-community-post-favorite-mutation";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";

export interface CommunityPostFavoriteButtonProps {
  communityPostId: string;
  /** 跟 favorite-button.tsx 的 variant 完全一致：default 是 36×36 圆形图标
   *  按钮，icon 是 Star 图标 + 小字号文字标签竖排（详情页操作行用）。只改
   *  展示形式，登录跳转/收藏切换/错误提示这套逻辑两个变体共用。 */
  variant?: "default" | "icon" | "inline";
  /** inline 变体在星星右边显示的收藏数（帖子列表操作行用）。 */
  favoriteCount?: number;
}

/**
 * 社区帖子收藏按钮——逐字照抄 favorite-button.tsx（用 Star 图标，不是
 * ActivityFavoriteButton 的 Heart：社区帖子视觉上更接近帖子，不是活动），
 * 只是 prop 从 postId 换成 communityPostId，内部换成社区帖子的两个 hook。
 *
 * 点击时 preventDefault + stopPropagation，避免嵌在 <Link> 里时同时触发外层
 * 导航；未登录点击只是跳去 /login，不发起请求；只对账号受限
 * （ACCOUNT_RESTRICTED）这一种明确的失败原因展示提示，其它失败静默——跟
 * FavoriteButton 的既有行为保持一致。
 */
export function CommunityPostFavoriteButton({
  communityPostId,
  variant = "default",
  favoriteCount
}: CommunityPostFavoriteButtonProps) {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: favoritedIds } = useCommunityPostFavoriteIdsQuery();
  const toggleFavorite = useToggleCommunityPostFavoriteMutation();
  const [restrictedError, setRestrictedError] = useState<string | null>(null);

  const isFavorited = Boolean(userId) && (favoritedIds ?? []).includes(communityPostId);

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();

    if (!userId) {
      navigate("/login");
      return;
    }

    if (toggleFavorite.isPending) return;

    setRestrictedError(null);
    toggleFavorite.mutate(
      {
        userId,
        communityPostId,
        isCurrentlyFavorited: isFavorited
      },
      {
        onError: (error) => {
          if (error instanceof AppError && error.code === "ACCOUNT_RESTRICTED") {
            setRestrictedError(error.message);
          }
        }
      }
    );
  }

  // inline：帖子列表操作行用（community-post-action-bar.tsx）——跟详情页同一个
  // 无圆框的 Star 线条图标，右边跟收藏数，不带"收藏"文字，像 Reddit 列表一样紧凑。
  if (variant === "inline") {
    return (
      <span className="relative">
        <button
          type="button"
          aria-pressed={isFavorited}
          aria-label={isFavorited ? "取消收藏" : "收藏"}
          disabled={toggleFavorite.isPending}
          onClick={handleClick}
          className="flex items-center gap-1 py-1 text-sm text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Star
            size={20}
            aria-hidden="true"
            fill={isFavorited ? "currentColor" : "none"}
            className={isFavorited ? "text-primary" : undefined}
          />
          {favoriteCount !== undefined ? <span>{favoriteCount}</span> : null}
        </button>
        {restrictedError ? (
          <p role="alert" className="absolute left-0 top-full mt-1 w-56 text-xs text-danger">
            {restrictedError}
          </p>
        ) : null}
      </span>
    );
  }

  if (variant === "icon") {
    return (
      <span>
        <button
          type="button"
          aria-pressed={isFavorited}
          aria-label={isFavorited ? "取消收藏" : "收藏"}
          disabled={toggleFavorite.isPending}
          onClick={handleClick}
          className="flex flex-col items-center gap-1 text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Star
            size={22}
            aria-hidden="true"
            fill={isFavorited ? "currentColor" : "none"}
            className={isFavorited ? "text-primary" : undefined}
          />
          <span className="text-xs">收藏</span>
        </button>
        {restrictedError ? <p role="alert" className="mt-1 text-xs text-danger">{restrictedError}</p> : null}
      </span>
    );
  }

  return (
    <span>
      <button
        type="button"
        aria-pressed={isFavorited}
        aria-label={isFavorited ? "取消收藏" : "收藏"}
        disabled={toggleFavorite.isPending}
        onClick={handleClick}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Star
          size={18}
          aria-hidden="true"
          fill={isFavorited ? "currentColor" : "none"}
          className={isFavorited ? "text-primary" : undefined}
        />
      </button>
      {restrictedError ? <p role="alert" className="mt-1 text-xs text-danger">{restrictedError}</p> : null}
    </span>
  );
}

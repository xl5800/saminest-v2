import { Star } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useFavoritePostIdsQuery } from "../features/favorites/use-favorite-post-ids-query";
import { useToggleFavoriteMutation } from "../features/favorites/use-toggle-favorite-mutation";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";

export interface FavoriteButtonProps {
  postId: string;
  /** default（现状："★ 已收藏"/"☆ 收藏" 纯文字，我的收藏列表页
   *  favorites-page.tsx 在用）｜ icon（23 号卡新增：Star 图标 + 小字号
   *  文字标签竖排，帖子详情页的分享/收藏/举报三图标一行在用）。只改展示
   *  形式，下面的登录跳转/收藏切换/错误提示这套逻辑两个变体完全共用，
   *  不重复实现。不传就是 default，favorites-page.tsx 的调用点不用跟着
   *  改。 */
  variant?: "default" | "icon";
}

/**
 * 收藏按钮：列表项和详情页都会用到，可能嵌套在 <Link> 里面（见
 * PostList），所以点击时要 preventDefault + stopPropagation，避免同时
 * 触发外层的导航。
 *
 * 未登录点击只是跳去 /login，不发起任何收藏请求、也不报错——这里不做
 * "登录后回跳"，见任务范围说明。
 *
 * 这里之前没有任何失败提示 UI（收藏/取消收藏失败就静默无反应）。这次只
 * 补上账号被封禁（suspended）这一种明确、可操作的失败原因的提示——跟
 * report-post-page.tsx 的 REPORT_DUPLICATE 分支同一个模式，只是这里没有
 * "既有的通用失败兜底文案"可以对照，所以只在能识别出 ACCOUNT_RESTRICTED
 * 时才展示错误，其它未知失败原因维持这个按钮原来"静默无反应"的行为，不在
 * 这次任务里顺带给它加一个通用错误兜底（那是超出这次任务范围的改动）。
 */
export function FavoriteButton({ postId, variant = "default" }: FavoriteButtonProps) {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: favoritedPostIds } = useFavoritePostIdsQuery();
  const toggleFavorite = useToggleFavoriteMutation();
  const [restrictedError, setRestrictedError] = useState<string | null>(null);

  const isFavorited = Boolean(userId) && (favoritedPostIds ?? []).includes(postId);

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
        postId,
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
        {restrictedError ? <p role="alert">{restrictedError}</p> : null}
      </span>
    );
  }

  return (
    <span>
      <button
        type="button"
        aria-pressed={isFavorited}
        disabled={toggleFavorite.isPending}
        onClick={handleClick}
      >
        {isFavorited ? "★ 已收藏" : "☆ 收藏"}
      </button>
      {restrictedError ? <p role="alert">{restrictedError}</p> : null}
    </span>
  );
}

import { Star } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useFavoritePostIdsQuery } from "../features/favorites/use-favorite-post-ids-query";
import { useToggleFavoriteMutation } from "../features/favorites/use-toggle-favorite-mutation";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";

export interface FavoriteButtonProps {
  postId: string;
  /** default（我的收藏列表页 favorites-page.tsx 在用：36×36 圆形图标
   *  按钮，DESIGN.md 的 icon-button token——UI 审计 P0 #2 之前这里是裸
   *  文字"★ 已收藏"/"☆ 收藏"，没有任何样式，现在跟 icon 变体一样用
   *  Star 图标+aria-label，只是没有竖排的文字标签）｜ icon（23 号卡
   *  新增：Star 图标 + 小字号文字标签竖排，帖子详情页的分享/收藏/举报
   *  三图标一行在用）。只改展示形式，下面的登录跳转/收藏切换/错误提示
   *  这套逻辑两个变体完全共用，不重复实现。不传就是 default，
   *  favorites-page.tsx 的调用点不用跟着改。 */
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
 *
 * 全 App 视觉 Token 体系（第二批）：收藏态图标已经是 text-primary（蓝色），
 * 未收藏态是 text-text-muted，没有红色心形，检查过符合"不要用大红色心形"
 * 这条要求，未改动。顺手发现两处 restrictedError 的 role="alert" 文字
 * 之前完全没有颜色 class（直接继承默认黑字），补上 text-danger——这是
 * 任务卡"Loading/Empty/Error 状态"那条要求顺手检查的场景，范围很小（就
 * 这一个文件两处），直接改了，不是大范围改动。
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

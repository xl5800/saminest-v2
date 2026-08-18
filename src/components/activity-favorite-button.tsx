import { Heart } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useActivityFavoriteIdsQuery } from "../features/activities/use-activity-favorite-ids-query";
import { useToggleActivityFavoriteMutation } from "../features/activities/use-toggle-activity-favorite-mutation";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";

export interface ActivityFavoriteButtonProps {
  activityId: string;
}

/**
 * 活动收藏按钮：结构上照抄 favorite-button.tsx（未登录点击跳 /login、
 * 不发起收藏请求；账号受限的错误提示；mutation pending 时禁用防重复
 * 提交），只是视觉上换成设计稿要求的 lucide-react Heart 图标（未收藏描边、
 * 已收藏填充成 danger 色），不是 FavoriteButton 现在用的 ★/☆ 文字符号。
 *
 * 故意不去改 FavoriteButton 本身让它也用图标——那是帖子详情页/列表页在用
 * 的另一个组件，这次任务卡的设计稿只针对活动详情页，两个收藏按钮视觉上
 * 暂时不一致是已知、可接受的差异，不在这次任务范围内一起改掉。
 */
export function ActivityFavoriteButton({ activityId }: ActivityFavoriteButtonProps) {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: favoritedActivityIds } = useActivityFavoriteIdsQuery();
  const toggleFavorite = useToggleActivityFavoriteMutation();
  const [restrictedError, setRestrictedError] = useState<string | null>(null);

  const isFavorited = Boolean(userId) && (favoritedActivityIds ?? []).includes(activityId);

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
        activityId,
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

  return (
    <span>
      <button
        type="button"
        aria-pressed={isFavorited}
        disabled={toggleFavorite.isPending}
        onClick={handleClick}
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-danger"
      >
        <Heart
          size={16}
          className={isFavorited ? "fill-current text-danger" : undefined}
        />
        收藏
      </button>
      {restrictedError ? <p role="alert">{restrictedError}</p> : null}
    </span>
  );
}

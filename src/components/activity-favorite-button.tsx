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
 * 提交），视觉上用 lucide-react 的 Heart 图标（未收藏描边、已收藏填充），
 * 不是 FavoriteButton 现在用的 ★/☆ 文字符号。
 *
 * 故意不去改 FavoriteButton 本身让它也用图标——那是帖子详情页/列表页在用
 * 的另一个组件，这次任务卡的设计稿只针对活动详情页，两个收藏按钮视觉上
 * 暂时不一致是已知、可接受的差异，不在这次任务范围内一起改掉。
 *
 * 全 App 视觉 Token 体系（第二批）：已收藏填充色原来是 danger 红——这是
 * 之前那张任务卡的设计稿要求（上面这段历史注释原文就是"填充成 danger
 * 色"），但 BARRY 这次的全局方案明确要求"不要用大红色心形"，收藏态统一用
 * 品牌蓝 --color-primary，这次改成 text-primary（hover 态跟着从
 * hover:text-danger 换成 hover:text-primary，两者是同一处"红色收藏语言"
 * 的一部分）。这是对上一张任务卡具体设计决定的一次推翻，不是我自己判断
 * 要改，是这次任务卡明确点名"检查是否硬编码了红色心形图标"、且给出了
 * 具体替代方案，所以照办；未收藏态的描边颜色继承自按钮本身的 text-text
 * （菜单项文字色），跟这次改动无关，没有动。
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
    <span className="block">
      <button
        type="button"
        aria-pressed={isFavorited}
        disabled={toggleFavorite.isPending}
        onClick={handleClick}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text hover:bg-bg hover:text-primary"
      >
        <Heart
          size={16}
          aria-hidden="true"
          className={isFavorited ? "fill-current text-primary" : undefined}
        />
        收藏
      </button>
      {restrictedError ? <p role="alert" className="mt-1 text-xs text-danger">{restrictedError}</p> : null}
    </span>
  );
}

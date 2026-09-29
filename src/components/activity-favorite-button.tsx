import { Heart } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useActivityFavoriteIdsQuery } from "../features/activities/use-activity-favorite-ids-query";
import { useToggleActivityFavoriteMutation } from "../features/activities/use-toggle-activity-favorite-mutation";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";

export interface ActivityFavoriteButtonProps {
  activityId: string;
  /** menu（默认，原来的样子）：横向菜单行，配合 TopBar 的"…"更多菜单——
   *  这个按钮改版之前唯一的调用场景。｜ icon：design_handoff_saminest_ios
   *  第 4 项新增——活动详情页底部固定操作栏需要跟 FavoriteButton 的
   *  `variant="icon"`（收藏图标 22px + 竖排小字"收藏"）同一种视觉形状，
   *  照抄那边的 className，不是重新设计一套。未登录跳转/收藏切换/错误
   *  提示这套逻辑两个变体完全共用，不重复实现，只改展示形式。 */
  variant?: "menu" | "icon";
}

/**
 * 活动收藏按钮：结构上照抄 favorite-button.tsx（未登录点击跳 /login、
 * 不发起收藏请求；账号受限的错误提示；mutation pending 时禁用防重复
 * 提交），视觉上用 lucide-react 的 Heart 图标（未收藏描边、已收藏填充），
 * 不是 FavoriteButton 现在用的 ★/☆ 文字符号。
 *
 * 故意不去改 FavoriteButton 本身让它也用图标——那是帖子详情页/列表页在用
 * 的另一个组件，这两个收藏按钮视觉上不完全一致（Heart vs Star）是已知、
 * 可接受的差异，不在这次任务范围内合并成一个组件。
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
export function ActivityFavoriteButton({ activityId, variant = "menu" }: ActivityFavoriteButtonProps) {
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
          <Heart
            size={22}
            aria-hidden="true"
            className={isFavorited ? "fill-current text-primary" : undefined}
          />
          <span className="text-xs">收藏</span>
        </button>
        {restrictedError ? <p role="alert" className="mt-1 text-xs text-danger">{restrictedError}</p> : null}
      </span>
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

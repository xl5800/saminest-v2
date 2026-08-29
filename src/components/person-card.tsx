import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export interface PersonCardProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** 卡片副标题，调用方决定内容——activity-detail-page.tsx 传"发起人"，
   *  post-detail-page.tsx（23 号卡）传"发布于 X 前"这种相对时间文案。组件
   *  本身不关心这行文字具体说的是什么。 */
  subtitle: string;
}

/**
 * 头像 + 昵称 + 副标题 + chevron 的整行可点卡片，点击跳转对方的公开主页
 * （/users/:userId）——23 号卡从 activity-detail-page.tsx 的"发起人卡片"
 * 抽出来的共享组件，帖子详情页的"发帖者卡片"复用同一个组件，不是照着
 * 视觉效果另外重写一遍类似的东西。
 *
 * 原来 activity-detail-page.tsx 内联实现里 chevron 用的是 `text-chev`
 * 这个类名——项目里从来没有定义过 `--color-chev` 这个 token（真正的 token
 * 是 `--color-chevron`，见 index.css），Tailwind 对不认识的类名直接不生成
 * 对应 CSS，这个 chevron 之前实际上一直是默认文字颜色，不是设计要求的
 * 浅灰色。抽成这个共享组件时顺手改成了正确的 `text-chevron`——这是抽取
 * 途中顺带发现并修正的一个既有小 bug，不是这次任务卡要求的改动，两个
 * 页面的 chevron 颜色都会从"默认黑"变成"浅灰"，写在 23 号卡完工报告里
 * 单独说明。
 */
export function PersonCard({ userId, displayName, avatarUrl, subtitle }: PersonCardProps) {
  return (
    <Link
      to={`/users/${userId}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white p-3 hover:border-primary"
    >
      <span className="flex min-w-0 items-center gap-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          >
            {displayName.trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-text">{displayName}</span>
          <span className="block text-xs text-text-muted">{subtitle}</span>
        </span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-chevron" />
    </Link>
  );
}

import { BadgeCheck } from "lucide-react";
import { Link } from "react-router-dom";

export type CommunityCardJoinState = "join" | "joining" | "joined" | "leaving";

export interface CommunityCardProps {
  name: string;
  memberCount: number;
  /** 今日新帖子数；还在加载（undefined）时整段"今日 N 个新帖子"不渲染，
   *  不展示一个会跳变的 0。 */
  todayPostCount: number | undefined;
  description: string;
  /** 整张卡片点击后跳转的路径。 */
  to: string;
  joinState: CommunityCardJoinState;
  onJoin: () => void;
  /** 已加入状态下点"退出"。 */
  onLeave: () => void;
  /** 是否显示名称旁的认证图标。多社区之后只有官方社区（communities.is_official）
   *  才该带；默认 true 保持原来"总是显示"的行为，调用方按需传 false。 */
  isOfficial?: boolean;
}

/**
 * 社区浏览页（community-browse-page.tsx）/ 全站搜索页的社区卡片：名称/认证图标 +
 * "成员数 · 今日 N 个新帖子" + 右侧加入/退出按钮，下面一行简介。原来左侧的"DMV"
 * 方块缩写头像和简介前的"州社区"标签已去掉（三个社区头像都是"DMV"、标签都是
 * "州社区"，没有区分作用）。
 *
 * 整张卡片点击跳转 + 卡片里还有一个"加入"按钮，用"拉伸链接"写法：一个
 * `absolute inset-0` 的 <Link> 铺满卡片负责整卡点击，"加入"按钮用
 * `relative z-10` 浮在它上面单独响应点击。不能把整张卡片包成 <Link>——那样
 * "加入"按钮就成了 <a> 里嵌套的 <button>，是非法的 HTML 结构，点按钮还会
 * 同时触发外层导航（activity-card.tsx 同样的理由，见该文件注释）。已加入
 * 状态下按钮变成描边样式的"退出"，点了调 onLeave；请求进行中分别显示禁用的
 * "加入中…"/"退出中…"。
 *
 * 认证图标是装饰性的（aria-hidden），没有给它配"官方社区"这类可访问文案：
 * 前端目前没有读 communities.is_official 这一列，这个图标代表什么不由本组件
 * 判断，只是设计稿要的视觉元素。
 */
export function CommunityCard({
  name,
  memberCount,
  todayPostCount,
  description,
  to,
  joinState,
  onJoin,
  onLeave,
  isOfficial = true
}: CommunityCardProps) {
  const meta =
    todayPostCount === undefined
      ? `${memberCount} 位成员`
      : `${memberCount} 位成员 · 今日 ${todayPostCount} 个新帖子`;

  return (
    <div className="relative rounded-card-lg border border-border bg-card-white p-4 shadow-card">
      <Link to={to} aria-label={name} className="absolute inset-0 rounded-card-lg" />
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h2 className="truncate text-base font-semibold text-text">{name}</h2>
            {isOfficial ? (
              <BadgeCheck aria-hidden="true" size={16} className="shrink-0 text-primary" />
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-text-muted">{meta}</p>
        </div>
        {joinState === "joined" || joinState === "leaving" ? (
          <button
            type="button"
            disabled={joinState === "leaving"}
            onClick={onLeave}
            className="relative z-10 shrink-0 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {joinState === "leaving" ? "退出中…" : "退出"}
          </button>
        ) : (
          <button
            type="button"
            disabled={joinState === "joining"}
            onClick={onJoin}
            className="relative z-10 shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {joinState === "joining" ? "加入中…" : "加入"}
          </button>
        )}
      </div>
      <p className="mt-3 line-clamp-2 break-words text-sm text-text-muted">{description}</p>
    </div>
  );
}

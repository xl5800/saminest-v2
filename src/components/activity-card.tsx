import { Link } from "react-router-dom";

import type { ActivityListItem, ActivityParticipant } from "../repositories/activities-repository";
import { getActivityChannelMeta } from "../repositories/activities-repository";
import { formatActivityStartAt } from "../utils/format";
import { ActivityParticipantAvatars } from "./activity-participant-avatars";

export interface ActivityCardProps {
  activity: ActivityListItem;
  /** 这张卡片的参与者预览（不含发起人），没查到就传空数组——跟
   *  ActivityParticipantAvatars 自己的 participants prop 是同一个约定。 */
  participants: ActivityParticipant[];
}

/**
 * "一起去"活动卡片，目前只有活动列表页在用。原来还被发起者主页的
 * "TA 发起的搭子"区块复用；07 号卡把那个区块整个删掉了（发起者主页现在
 * 只保留居中的"发消息"按钮，联系发起人/参与者统一走"点头像进主页"这一套
 * 机制，不再需要单独的活动列表入口），这个组件因此变回单一调用点，但组件
 * 本身还是抽出来单独一个文件——活动列表页之外，将来别处如果要展示同样的
 * 活动卡片，不需要重新拼一遍这段 JSX。
 *
 * 整张卡片是一个 <Link to="/activities/:id">（点哪里都跳详情页），头像
 * 堆叠传 interactive={false}——空位因此渲染成纯展示的 <span> 而不是
 * <button>，避免"<a> 嵌套可交互 <button>"这种非法 HTML 结构，见
 * activity-participant-avatars.tsx 里 interactive prop 的注释。
 *
 * 07 号卡（活动卡片头像区放大）：内边距从 12px（p-3）放大到 20px
 * （p-5），配合头像从 48px 叠放放大成 64px 网格平铺后需要的呼吸空间；
 * 不再显式传 maxVisibleSlots 给头像堆叠——"最多 8 个视觉位置"的规则已经
 * 统一收进 ActivityParticipantAvatars 内部（列表卡片和详情页共用同一套
 * 规则，不需要调用方各自定制一个更小的数字，见该组件顶部注释）。卡片高度
 * 允许随头像行数（1 行/2 行）变化，不强制跟同一列表里其它卡片等高——07
 * 号卡明确写了这条，这里没有额外加 min-h 之类的东西去抹平差异。
 */
export function ActivityCard({ activity, participants }: ActivityCardProps) {
  const { emoji } = getActivityChannelMeta(activity.channel);

  return (
    <Link
      to={`/activities/${activity.id}`}
      className="block rounded-2xl border border-border bg-white p-5 shadow-card"
    >
      <ActivityParticipantAvatars
        organizerId={activity.organizerId}
        organizerDisplayName={activity.organizerDisplayName}
        organizerAvatarUrl={activity.organizerAvatarUrl}
        participants={participants}
        capacity={activity.capacity}
        interactive={false}
      />
      {/* 头像区到标题的间距跟着内边距的放大比例一起放大（8px → 12px）：
          12px/20px 跟原来 8px/12px 是同一个"内边距的 60%"比例，维持视觉
          节奏一致，不是任意取值。 */}
      <p className="mt-3 line-clamp-2 break-words text-base text-text">
        {emoji} {activity.title}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        {activity.isOnline ? "线上" : activity.landmarkText ?? activity.locationName ?? "地点待定"}
      </p>
      <p className="mt-1 text-xs text-text-muted">{formatActivityStartAt(activity.startAt)}</p>
    </Link>
  );
}

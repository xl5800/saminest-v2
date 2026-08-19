import { Link } from "react-router-dom";

import type { ActivityListItem, ActivityParticipant } from "../repositories/activities-repository";
import { getActivityChannelMeta } from "../repositories/activities-repository";
import { formatActivityStartAt } from "../utils/format";
import { ActivityParticipantAvatars } from "./activity-participant-avatars";

// 卡片空间比详情页紧凑，头像堆叠的可见数量上限调小一点（详情页默认
// MAX_VISIBLE_SLOTS = 5，见 activity-participant-avatars.tsx）。
const CARD_AVATAR_MAX_VISIBLE_SLOTS = 4;

export interface ActivityCardProps {
  activity: ActivityListItem;
  /** 这张卡片的参与者预览（不含发起人），没查到就传空数组——跟
   *  ActivityParticipantAvatars 自己的 participants prop 是同一个约定。 */
  participants: ActivityParticipant[];
}

/**
 * "一起去"活动卡片——04 号卡要求"活动卡片（列表页和发起者主页里复用的）
 * 头像统一是放大后的 48px 样式"，从 activity-list-page.tsx 抽出来，供
 * 活动列表页和发起者主页的"TA 发起的搭子"区块共用，不是两处各写一份
 * 长得很像但容易慢慢跑偏的 JSX。
 *
 * 整张卡片是一个 <Link to="/activities/:id">（点哪里都跳详情页），头像
 * 堆叠传 interactive={false}——空位因此渲染成纯展示的 <span> 而不是
 * <button>，避免"<a> 嵌套可交互 <button>"这种非法 HTML 结构，见
 * activity-participant-avatars.tsx 里 interactive prop 的注释。
 */
export function ActivityCard({ activity, participants }: ActivityCardProps) {
  const { emoji } = getActivityChannelMeta(activity.channel);

  return (
    <Link
      to={`/activities/${activity.id}`}
      className="block rounded-2xl border border-border bg-white p-3 shadow-card"
    >
      <ActivityParticipantAvatars
        organizerId={activity.organizerId}
        organizerDisplayName={activity.organizerDisplayName}
        organizerAvatarUrl={activity.organizerAvatarUrl}
        participants={participants}
        capacity={activity.capacity}
        interactive={false}
        maxVisibleSlots={CARD_AVATAR_MAX_VISIBLE_SLOTS}
      />
      <p className="mt-2 line-clamp-2 break-words text-base text-text">
        {emoji} {activity.title}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        {activity.isOnline ? "线上" : activity.landmarkText ?? activity.locationName ?? "地点待定"}
      </p>
      <p className="mt-1 text-xs text-text-muted">{formatActivityStartAt(activity.startAt)}</p>
    </Link>
  );
}

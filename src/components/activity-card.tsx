import { Link } from "react-router-dom";

import { formatLocationDisplayName } from "../data/us-states";
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
 * 14 号卡（找搭子页改版：顶部栏 + 活动卡片头像展示）：头像区改成
 * shape="square" 的正方形拼图，且要求"紧贴卡片左右边缘、贴着卡片顶部、
 * 铺满整个卡片宽度，不要有卡片自己的左右内边距"——这跟 07 号卡定下的
 * "整张卡片统一 p-5 内边距"直接冲突，所以这次把 p-5 从最外层 <Link> 挪到
 * 头像区下面单独一个 <div> 上，只包标题/地点/时间这几行文字；头像区本身
 * 变成 <Link> 的第一个直接子元素，不再套在任何有内边距的容器里，才能真的
 * 顶到卡片边缘。外层 <Link> 加 overflow-hidden——头像格铺满卡片整宽后四个
 * 角会紧贴卡片的 rounded-2xl 圆角，不加这个的话方形头像格的直角会盖住卡片
 * 本来的圆角，视觉上变成方卡片。
 */
export function ActivityCard({ activity, participants }: ActivityCardProps) {
  const { emoji } = getActivityChannelMeta(activity.channel);

  return (
    <Link
      to={`/activities/${activity.id}`}
      className="block overflow-hidden rounded-2xl border border-border bg-white shadow-card"
    >
      <ActivityParticipantAvatars
        organizerId={activity.organizerId}
        organizerDisplayName={activity.organizerDisplayName}
        organizerAvatarUrl={activity.organizerAvatarUrl}
        participants={participants}
        capacity={activity.capacity}
        interactive={false}
        shape="square"
      />
      <div className="p-5 pt-3">
        <p className="line-clamp-2 break-words text-base text-text">
          {emoji} {activity.title}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {activity.isOnline
            ? "线上"
            : activity.landmarkText ??
              (activity.locationName ? formatLocationDisplayName(activity.locationName) : "地点待定")}
        </p>
        <p className="mt-1 text-xs text-text-muted">{formatActivityStartAt(activity.startAt)}</p>
      </div>
    </Link>
  );
}

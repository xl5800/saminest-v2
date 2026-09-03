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
 * "整张卡片统一 p-5 内边距"直接冲突，所以把 p-5 从最外层 <Link> 挪到
 * 头像区下面单独一个 <div> 上，只包标题/地点/时间这几行文字。外层 <Link>
 * 加 overflow-hidden——头像格铺满卡片整宽后四个角会紧贴卡片的 rounded-2xl
 * 圆角，不加这个的话方形头像格的直角会盖住卡片本来的圆角，视觉上变成方
 * 卡片；这条理由跟头像格在 <Link> 里排第几个子元素无关，头像格贴的是哪条
 * 边就盖住哪条边的圆角，所以不管头像格是第一个还是最后一个子元素都需要
 * 这个 overflow-hidden。
 *
 * 任务卡 7c（活动卡片视觉还原，只保留顺序对调）：产品验收后反馈"找搭子
 * 卡片重排版"那次改版做过头了——产品原话"我只是想再预览卡片把头像和文字
 * 互换位置，但是你把头像和文字都改的很小""整体都偏小，想干脆只做位置
 * 互换"。这次把"合并地点+时间成一行""头像格子缩小成带内边距的小方块"
 * "内边距改成统一 p-5"这几处非顺序改动全部撤销、还原回 14 号卡定的样子
 * （标题/地点/时间跟改版前一样是各自独立的 <p>，头像格还是贴边铺满整卡
 * 宽度的大方块，内边距还是"头像区不带内边距、文字区单独一层 p-5"的两段式
 * 结构，ActivityParticipantAvatars 这次调用点也不再传 size 这个 prop——
 * 这个 prop 连同它撑起来的 compact 展示逻辑已经在
 * activity-participant-avatars.tsx 里整个删掉，不是只在这里不传了事）；
 * **唯一保留的改动**是产品明确要的那一件事——卡片顶层"文字块"（标题+地点+
 * 时间）和"头像拼图块"这两个直接子元素的上下顺序对调：文字块现在排在
 * <Link> 里的第一位、头像拼图块排在第二位（14 号卡定的顺序反过来，之前
 * 是头像在上、文字在下）。除了这一处顺序，两段 JSX 各自内部的每一个
 * className/prop/子元素结构都跟 14 号卡定的版本逐字一致。
 */
export function ActivityCard({ activity, participants }: ActivityCardProps) {
  const { emoji } = getActivityChannelMeta(activity.channel);

  return (
    <Link
      to={`/activities/${activity.id}`}
      className="block overflow-hidden rounded-2xl border border-border bg-white shadow-card"
    >
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
      <ActivityParticipantAvatars
        organizerId={activity.organizerId}
        organizerDisplayName={activity.organizerDisplayName}
        organizerAvatarUrl={activity.organizerAvatarUrl}
        participants={participants}
        capacity={activity.capacity}
        interactive={false}
        shape="square"
      />
    </Link>
  );
}

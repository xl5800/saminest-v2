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
 * 找搭子列表卡片改版任务卡：把卡片视觉顺序从"头像拼图 → 还差 N 人 → 标题
 * → 地点 → 时间（两行）"改成"标题 → 地点+时间合并成一行摘要 → 小号头像行
 * → 还差 N 人"，对照产品给的方案图：
 * 1. 标题挪到最上面——原来头像拼图（14 号卡定的，铺满卡片整宽、贴着卡片
 *    顶部和左右边缘、没有卡片自己的内边距）是 <Link> 的第一个直接子元素，
 *    文字内容单独在下面一个 p-5 的 <div> 里；这次头像行缩小、不再铺满整卡
 *    宽度（见下面第 3 点），不需要再"贴边"，整张卡片改回跟 07 号卡之前
 *    一样、一路到底统一用同一层 p-5 内边距，不再需要把内边距拆成"外层
 *    <Link> 不带、下面单独一个 <div> 补上"这种两段式结构，外层 <Link>
 *    也不再需要 14 号卡为了让方形头像格不盖住卡片圆角而加的
 *    overflow-hidden——头像格已经不会跟卡片边缘/圆角冲突了。
 * 2. 地点和时间合并成同一行摘要文字（原来的 landmarkText/locationName 判断
 *    逻辑、formatActivityStartAt 调用完全不变，只是从两个 <p> 改成一个
 *    <p> 里用" · "拼起来，不引入新的格式化逻辑）。
 * 3. 头像行改用 ActivityParticipantAvatars 新增的 size="compact"（详见
 *    activity-participant-avatars.tsx 顶部注释和 COMPACT_AVATAR_SIZE_CLASS_NAME
 *    的说明）——固定 64px 小方块，不铺满卡片宽度，自然换行不横向滚动。
 *    这个 prop 只在这一个调用点传，详情页（activity-detail-page.tsx，
 *    这次任务禁止改动）用的是同一个 shape="square" 但不传 size，继续拿到
 *    跟改版前逐像素一致的大号铺满效果，两处调用点互不影响。
 * 4. "还差 N 人（X/Y）"这行文案（ActivityParticipantAvatars 自己渲染，复用
 *    现成的 formatActivityParticipantSummary，这次没有改这个函数）现在
 *    排在头像行下面——顺序天然由 ActivityParticipantAvatars 内部固定
 *    （头像网格在上、caption 在下），不需要卡片这边额外调整。
 */
export function ActivityCard({ activity, participants }: ActivityCardProps) {
  const { emoji } = getActivityChannelMeta(activity.channel);
  const locationLabel = activity.isOnline
    ? "线上"
    : activity.landmarkText ??
      (activity.locationName ? formatLocationDisplayName(activity.locationName) : "地点待定");

  return (
    <Link
      to={`/activities/${activity.id}`}
      className="block rounded-2xl border border-border bg-white p-5 shadow-card"
    >
      <p className="line-clamp-2 break-words text-base text-text">
        {emoji} {activity.title}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        {locationLabel} · {formatActivityStartAt(activity.startAt)}
      </p>
      <div className="mt-3">
        <ActivityParticipantAvatars
          organizerId={activity.organizerId}
          organizerDisplayName={activity.organizerDisplayName}
          organizerAvatarUrl={activity.organizerAvatarUrl}
          participants={participants}
          capacity={activity.capacity}
          interactive={false}
          shape="square"
          size="compact"
        />
      </div>
    </Link>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";

import { ActivityParticipantAvatars } from "../../components/activity-participant-avatars";
import { useActivitiesQuery } from "../../features/activities/use-activities-query";
import { useActivityParticipantPreviewsQuery } from "../../features/activities/use-activity-participant-previews-query";
import { useActivityRegionsQuery } from "../../features/locations/use-activity-regions-query";
import {
  ACTIVITY_CHANNEL_OPTIONS,
  getActivityChannelMeta
} from "../../repositories/activities-repository";
import { formatActivityStartAt } from "../../utils/format";

// 列表卡片空间比详情页紧凑，头像堆叠的可见数量上限调小一点（详情页默认
// MAX_VISIBLE_SLOTS = 5），格子/溢出徽标的计算逻辑不用改，只是换一个更
// 小的 maxVisibleSlots。
const CARD_AVATAR_MAX_VISIBLE_SLOTS = 4;

/**
 * "一起去"活动列表页（/activities，公开，不需要登录，游客也能刷）。
 *
 * 单栏纵向列表（Meet5 风格）：从原来的瀑布流两栏 columns-2 卡片改成
 * flex-col 单栏，一张接一张往下排，每张卡片占满整行宽度。卡片内容顺序：
 * 头像堆叠（发起人+参与者，头像排列占据视觉主体） → 标题（emoji+文字）→
 * 地址 → 时间。原来卡片底部的"频道标签 pill + 人数摘要文字"这一行去掉了：
 * 频道信息继续靠标题前的 emoji 传达（现状已经如此），人数信息现在由头像
 * 堆叠组件自带的 caption（同一个 formatActivityParticipantSummary，组件
 * 内部已经在渲染）承担，不需要卡片再单独展示一份，避免同一条信息出现两次。
 *
 * 每张卡片整体仍然是一个 <Link to="/activities/:id">（点哪里都跳详情页，
 * 这是改版前就有的行为，不变）——头像堆叠传 interactive={false}，空位
 * 因此渲染成纯展示的 <span> 而不是 <button>，避免"<a> 嵌套可交互
 * <button>"这种非法 HTML 结构（跟 conversation-list-page.tsx 修过的
 * "<a> 嵌套 <a>"是同一类问题），列表卡片的空位不支持点击报名——只在活动
 * 详情页保留这个交互，见 activity-participant-avatars.tsx 的注释。
 *
 * 参与者预览用 useActivityParticipantPreviewsQuery 一次性批量查（避免
 * N+1），activityIds 直接从 useActivitiesQuery 结果 map 出来——筛选条件
 * 变化导致 activities 变化时，这批 id 自然跟着变，hook 内部按新的
 * queryKey 重新查询，不需要额外处理。
 *
 * 没有做无限滚动——这一批活动数据量小，先用最简单的"一次性查全部"，等真的
 * 出现分页体量的活动数量再考虑加（跟 post-list.tsx 当初从"分页按钮"改成
 * "无限滚动"是同一类演进，不是必须一步到位的东西）。
 *
 * 频道筛选用 ACTIVITY_CHANNEL_OPTIONS 渲染成一排 pill（复用
 * category-nav.tsx 的视觉风格：h-11 圆角胶囊 + 选中态 bg-accent），地区
 * 筛选用 useActivityRegionsQuery——只到"州"这一级（DC/VA/MD），不是具体
 * 城市；发布表单也不再选城市，改成发起人自己把具体位置写进标题，见
 * create-activity-page.tsx 和 docs/01_Product/FindBuddy-Design.md。
 */
export function ActivityListPage() {
  const [channel, setChannel] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");

  const { data: activities, isPending, isError } = useActivitiesQuery({
    channel: channel || undefined,
    locationId: locationId || undefined
  });
  const { data: regions } = useActivityRegionsQuery();
  const { data: participantPreviews } = useActivityParticipantPreviewsQuery(
    (activities ?? []).map((activity) => activity.id)
  );

  const inactivePillClassName =
    "flex h-11 items-center justify-center rounded-full border border-border bg-bg px-4 text-sm whitespace-nowrap text-text-muted";
  const activePillClassName =
    "flex h-11 items-center justify-center rounded-full px-4 text-sm whitespace-nowrap bg-accent text-white font-semibold";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">🤝 一起去</h1>

      <nav aria-label="频道筛选" className="mb-2 flex gap-2 overflow-x-auto py-1">
        <button
          type="button"
          aria-current={channel === "" ? "page" : undefined}
          onClick={() => setChannel("")}
          className={channel === "" ? activePillClassName : inactivePillClassName}
        >
          全部
        </button>
        {ACTIVITY_CHANNEL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-current={channel === option.value ? "page" : undefined}
            onClick={() => setChannel(option.value)}
            className={channel === option.value ? activePillClassName : inactivePillClassName}
          >
            {option.emoji} {option.label}
          </button>
        ))}
      </nav>

      <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
        州
        <select
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">全部地区</option>
          {(regions ?? []).map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
      </label>

      {isPending ? <p role="status">加载中…</p> : null}
      {isError ? <p role="alert">活动加载失败，请稍后重试。</p> : null}

      {!isPending && !isError && activities && activities.length === 0 ? (
        <p role="status">暂时没有符合条件的活动，换个筛选条件试试，或者自己发起一个。</p>
      ) : null}

      {!isPending && !isError && activities && activities.length > 0 ? (
        <div className="flex flex-col gap-3">
          {activities.map((activity) => {
            const { emoji } = getActivityChannelMeta(activity.channel);
            return (
              <Link
                key={activity.id}
                to={`/activities/${activity.id}`}
                className="block rounded-2xl border border-border bg-white p-3 shadow-card"
              >
                <ActivityParticipantAvatars
                  organizerId={activity.organizerId}
                  organizerDisplayName={activity.organizerDisplayName}
                  organizerAvatarUrl={activity.organizerAvatarUrl}
                  participants={participantPreviews?.get(activity.id) ?? []}
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
                <p className="mt-1 text-xs text-text-muted">
                  {formatActivityStartAt(activity.startAt)}
                </p>
              </Link>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}

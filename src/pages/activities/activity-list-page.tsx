import { useState } from "react";
import { Link } from "react-router-dom";

import { useActivitiesQuery } from "../../features/activities/use-activities-query";
import { useLocationsQuery } from "../../features/locations/use-locations-query";
import {
  ACTIVITY_CHANNEL_OPTIONS,
  getActivityChannelMeta
} from "../../repositories/activities-repository";
import {
  formatActivityParticipantSummary,
  formatActivityStartAt
} from "../../utils/format";

/**
 * "一起去"活动列表页（/activities，公开，不需要登录，游客也能刷）。
 *
 * 瀑布流卡片布局照抄 post-list.tsx 的做法（原生 CSS 多栏 columns-2 +
 * break-inside-avoid，不引入 JS masonry 库），这是设计文档明确要求的
 * "参照小红书瀑布流卡片"视觉，帖子列表已经踩过一遍这条路，没有理由为
 * 活动列表另起一套布局方式。没有做无限滚动——这一批活动数据量小，先用
 * 最简单的"一次性查全部"，等真的出现分页体量的活动数量再考虑加（跟
 * post-list.tsx 当初从"分页按钮"改成"无限滚动"是同一类演进，不是必须
 * 一步到位的东西）。
 *
 * 频道筛选用 ACTIVITY_CHANNEL_OPTIONS 渲染成一排 pill（复用
 * category-nav.tsx 的视觉风格：h-11 圆角胶囊 + 选中态 bg-accent），城市
 * 筛选复用现有的 useLocationsQuery（发布表单也在用同一个 hook/下拉数据），
 * 不是真实地理距离，是设计文档第 5 节明确说的"同城市"筛选。
 */
export function ActivityListPage() {
  const [channel, setChannel] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");

  const { data: activities, isPending, isError } = useActivitiesQuery({
    channel: channel || undefined,
    locationId: locationId || undefined
  });
  const { data: locations } = useLocationsQuery();

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
        城市
        <select
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">全部城市</option>
          {(locations ?? []).map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
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
        <div className="columns-2 gap-3">
          {activities.map((activity) => {
            const { emoji, label } = getActivityChannelMeta(activity.channel);
            return (
              <Link
                key={activity.id}
                to={`/activities/${activity.id}`}
                className="mb-3 block break-inside-avoid rounded-2xl border border-border bg-white p-3 shadow-card"
              >
                <p className="line-clamp-2 break-words text-base text-text">
                  {emoji} {activity.title}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {activity.isOnline ? "线上" : activity.landmarkText ?? activity.locationName ?? "地点待定"}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {formatActivityStartAt(activity.startAt)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
                    {label}
                  </span>
                  <span className="text-xs text-accent">
                    {formatActivityParticipantSummary(activity.participantCount, activity.capacity)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}

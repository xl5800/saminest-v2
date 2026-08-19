import { Filter } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ActivityCard } from "../../components/activity-card";
import { Fab } from "../../components/fab";
import { TopBar } from "../../components/top-bar";
import { useActivitiesQuery } from "../../features/activities/use-activities-query";
import { useActivityParticipantPreviewsQuery } from "../../features/activities/use-activity-participant-previews-query";
import { useActivityRegionsQuery } from "../../features/locations/use-activity-regions-query";
import { ACTIVITY_CHANNEL_OPTIONS } from "../../repositories/activities-repository";

/**
 * "找搭子"活动列表页（/activities，公开，不需要登录，游客也能刷）。
 *
 * Meet5 风格改版（04-find-buddy-flow.md）：顶部换成 TopBar 的 tab 变体，
 * 居中标题「找搭子」，不再有旧版 emoji 大标题「🤝 一起去」——组件本身
 * 已经是这个页面的 <h1>，删掉自己原来手写的 <h1>，避免同一个页面出现两个
 * <h1>（见 top-bar.tsx 顶部注释）。TopBar 右侧的筛选图标点击展开/收起
 * 州筛选行（之前常驻展示，现在收进这个开关里——跟 home-page.tsx 搜索框
 * "点🔍切换显隐"是同一个模式），频道筛选 Chips 继续常驻展示，不跟着收起
 * （04 号卡明确要求"类型筛选 Chips 保留"）。
 *
 * 悬浮按钮换成 01 号卡的 Fab 组件，variant="dark"，点击直接
 * navigate("/activities/new")——不经过"选择发布类型"弹层（那个弹层只在
 * 首页"＋"触发，见 05 号卡），这是这次改版对"找搭子"页发起流程的
 * 明确要求。
 *
 * 活动卡片本身抽成了共享组件 ActivityCard（见该文件顶部注释），发起者
 * 主页的"TA 发起的搭子"区块也在用同一个组件，保证两处头像堆叠是同一套
 * 放大后的 48px 样式，不会各自维护一份容易跑偏的 JSX。
 */
export function ActivityListPage() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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
    <main data-testid="activity-list-page" className="pb-24">
      <TopBar
        variant="tab"
        title="找搭子"
        right={{
          icon: <Filter size={18} aria-hidden="true" />,
          label: "筛选",
          onClick: () => setIsFilterOpen((current) => !current)
        }}
      />

      <div className="mx-auto max-w-2xl px-4 pt-2">
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

        {isFilterOpen ? (
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
        ) : null}

        {isPending ? <p role="status">加载中…</p> : null}
        {isError ? <p role="alert">活动加载失败，请稍后重试。</p> : null}

        {!isPending && !isError && activities && activities.length === 0 ? (
          <p role="status">暂时没有符合条件的活动，换个筛选条件试试，或者自己发起一个。</p>
        ) : null}

        {!isPending && !isError && activities && activities.length > 0 ? (
          <div className="flex flex-col gap-3">
            {activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                participants={participantPreviews?.get(activity.id) ?? []}
              />
            ))}
          </div>
        ) : null}
      </div>

      <Fab label="发起搭子" variant="dark" onClick={() => navigate("/activities/new")} />
    </main>
  );
}

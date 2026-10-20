import { MapPin } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ActivityCard } from "../../components/activity-card";
import { Skeleton } from "../../components/skeleton";
import { ACTIVITY_CHANNEL_OPTIONS } from "../../repositories/activities-repository";
import { useBlockedUserIds } from "../blocks/use-blocked-user-ids";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { useActivitiesQuery } from "./use-activities-query";
import { useActivityParticipantPreviewsQuery } from "./use-activity-participant-previews-query";

// 高频页面骨架屏任务卡：占位卡片数量，纯视觉估算（大致铺满一屏），不是
// 任务卡强制的精确值。
const ACTIVITY_SKELETON_COUNT = 4;

/**
 * 首页改版（招聘求职任务卡）：找搭子的"频道筛选 + 活动列表"原来整段写在
 * pages/activities/activity-list-page.tsx 里，现在首页"找搭子"标签也要
 * 显示同样的列表，所以原样抽成这个组件，两处共用（代码是搬过来的，逻辑、
 * 文案、样式没有改；各段历史说明见 activity-list-page.tsx 顶部注释）。
 * 搜索框留在页面里，关键字通过 searchQuery 传进来。
 */
export function ActivityFeed({ searchQuery = "" }: { searchQuery?: string }) {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<string>("");
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);

  const { data: activities, isPending, isError } = useActivitiesQuery({
    channel: channel || undefined,
    stateCode: selectedRegion?.stateCode
  });
  // 关键字筛选是纯客户端的一层再过滤，键还是用未过滤的 activities（不是
  // visibleActivities）——预览数据跟标题关键字无关，用完整列表查一次就
  // 够了，不需要每敲一个字就重新算一遍批量查询的参数。
  const blockedUserIds = useBlockedUserIds();
  const { data: participantPreviews } = useActivityParticipantPreviewsQuery(
    (activities ?? []).map((activity) => activity.id)
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();
  // 苹果审核 1.2 整改：被我屏蔽的用户发起的活动不显示。
  const unblockedActivities = activities?.filter((activity) => !blockedUserIds.has(activity.organizerId));
  const visibleActivities = trimmedQuery
    ? (unblockedActivities ?? []).filter((activity) => activity.title.toLowerCase().includes(trimmedQuery))
    : unblockedActivities;

  // 首页改版：频道筛选跟首页"全部 / 招聘 / 求职"那排小筛选用同一套样式
  // （高 32px、14px 字、选中浅蓝底蓝字、未选中浅灰底），原来是 44px 高的
  // 实心蓝胶囊，放在首页"找搭子"标签里跟其它标签的筛选大小不一致。
  const inactivePillClassName =
    "flex h-8 shrink-0 items-center rounded-full bg-field px-3.5 text-sm whitespace-nowrap text-text-body";
  const activePillClassName =
    "flex h-8 shrink-0 items-center rounded-full bg-primary-light px-3.5 text-sm font-semibold whitespace-nowrap text-primary";

  // 08 号卡 8.4：选中了某个州（且没有额外叠加频道筛选）但这个州压根没有
  // 任何活动时，展示专门的"发起第一个"引导，而不是通用的"换个筛选条件试试"
  // 文案——后者暗示"筛选条件可能不对"，但这里更准确的原因是"这个地区还没
  // 有内容"。限定 channel === ""（没有额外选中某个具体频道）是因为"这个
  // 地区还没有搭子活动"这句话必须在"没有任何频道过滤"的前提下才是准确的：
  // 如果用户同时选了某个频道，零结果更可能是"这个地区有活动、只是不是这个
  // 频道"，那种情况用回下面的通用文案更贴切，不应该误导用户以为整个地区
  // 都没有内容。18 号卡：这里故意继续只看服务端过滤后的原始 activities
  // （不是 visibleActivities），关键字筛没了结果不代表"这个地区没有活动"，
  // 那种情况应该走下面的通用空态文案，不能触发这条"发起第一个"引导。
  const isRegionEmptyState =
    !isPending && !isError && activities && activities.length === 0 && channel === "" && selectedRegion;

  return (
    <>
      <nav aria-label="频道筛选" className="-mx-4 mb-1 flex gap-2 overflow-x-auto px-4 pb-2 pt-3">
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

      {/* 高频页面骨架屏任务卡：占位卡片外层容器 class 照抄
          components/activity-card.tsx 真实卡片的
          overflow-hidden rounded-card-lg border border-border bg-card
          shadow-card，内部给标题（两行，模拟 line-clamp-2）+ 地点/时间
          两行次要信息占位（真实卡片的 p-5 pt-3 pb-2 文字区）。sr-only
          文字保留原来的无障碍播报，骨架块本身是纯视觉装饰。 */}
      {/* 高频页面骨架屏任务卡：占位卡片外层容器 class 照抄
          components/activity-card.tsx 真实卡片的
          overflow-hidden rounded-card-lg border border-border bg-card
          shadow-card，内部给标题（两行，模拟 line-clamp-2）+ 地点/时间
          两行次要信息占位（真实卡片的 p-5 pt-3 pb-2 文字区）。sr-only
          文字保留原来的无障碍播报，骨架块本身是纯视觉装饰。 */}
      {isPending ? (
        <div role="status">
          <span className="sr-only">加载中…</span>
          <div className="flex flex-col gap-3">
            {Array.from({ length: ACTIVITY_SKELETON_COUNT }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-card-lg border border-border bg-card shadow-card"
              >
                <div className="p-5 pt-3 pb-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="mt-1.5 h-5 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                  <Skeleton className="mt-1.5 h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {isError ? <p role="alert">活动加载失败，请稍后重试。</p> : null}

      {isRegionEmptyState ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <MapPin aria-hidden="true" size={32} className="text-text-subtle" />
          <p role="status" className="text-sm text-text-muted">
            这个地区还没有搭子活动，发起第一个吧
          </p>
          <button
            type="button"
            onClick={() => navigate("/activities/new")}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            发起搭子
          </button>
        </div>
      ) : null}

      {!isPending && !isError && visibleActivities && visibleActivities.length === 0 && !isRegionEmptyState ? (
        <p role="status">暂时没有符合条件的活动，换个筛选条件试试，或者自己发起一个。</p>
      ) : null}

      {!isPending && !isError && visibleActivities && visibleActivities.length > 0 ? (
        <div className="flex flex-col gap-3">
          {visibleActivities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              participants={participantPreviews?.get(activity.id) ?? []}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

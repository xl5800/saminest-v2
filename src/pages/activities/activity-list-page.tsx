import { MapPin } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ActivityCard } from "../../components/activity-card";
import { Fab } from "../../components/fab";
import { TopBar } from "../../components/top-bar";
import { formatSelectedRegionLabel } from "../../data/us-states";
import { useActivitiesQuery } from "../../features/activities/use-activities-query";
import { useActivityParticipantPreviewsQuery } from "../../features/activities/use-activity-participant-previews-query";
import { ACTIVITY_CHANNEL_OPTIONS } from "../../repositories/activities-repository";
import { useSelectedRegionStore } from "../../store/selected-region-store";

const REGION_SELECT_PATH = "/region-select";

/**
 * "找搭子"活动列表页（/activities，公开，不需要登录，游客也能刷）。
 *
 * Meet5 风格改版（04-find-buddy-flow.md）：顶部换成 TopBar 的 tab 变体，
 * 居中标题「找搭子」，不再有旧版 emoji 大标题「🤝 一起去」——组件本身
 * 已经是这个页面的 <h1>，删掉自己原来手写的 <h1>，避免同一个页面出现两个
 * <h1>（见 top-bar.tsx 顶部注释）。频道筛选 Chips 常驻展示（04 号卡明确
 * 要求"类型筛选 Chips 保留"）。
 *
 * 悬浮按钮换成 01 号卡的 Fab 组件，variant="dark"，点击直接
 * navigate("/activities/new")——不经过"选择发布类型"弹层（那个弹层只在
 * 首页"＋"触发，见 05 号卡），这是这次改版对"找搭子"页发起流程的
 * 明确要求。
 *
 * 活动卡片本身抽成了共享组件 ActivityCard（见该文件顶部注释）。
 *
 * 08 号卡（地区选择扩展全美 + 按州筛选）：删掉了这个页面原来自己维护的
 * "筛选"图标 + 州下拉框（本地 locationId/isFilterOpen state，只能在
 * DC/VA/MD 三个真实 locations 行之间选）——验收标准明确要求"找搭子列表页
 * 内容按选中州正确过滤，跟首页用的是同一个选中状态"，全美 51 项里大多数
 * 州压根没有对应的 locationId 可选，这个本地下拉框的机制天然覆盖不了，
 * 与其维护两套互相独立、容易让用户困惑"到底是哪个筛选在生效"的地区筛选
 * （页面本地下拉 + 全局 useSelectedRegionStore），不如直接改成跟首页一样
 * 读同一个全局 store。
 *
 * 14 号卡（找搭子页改版：顶部栏 + 活动卡片头像展示）：
 * - 居中的「找搭子」标题 + tab 变体整个换掉，改用 TopBar 的 home
 *   变体——左侧是跟首页左上角完全一样的"Saminest + 当前地区"胶囊
 *   （regionLabel/onRegionClick 直接复用首页那一套：同一个
 *   useSelectedRegionStore、同一个 formatSelectedRegionLabel 格式化函数、
 *   同一个 /region-select 路由，没有另起一套地区选择逻辑），只是不传
 *   onCreateClick——home 变体这次改成 onCreateClick 可选（见
 *   top-bar.tsx），不传就不渲染"＋"，找搭子页右侧因此只剩一个搜索图标，
 *   不需要新建一个近乎一样的 variant。
 * - 08 号卡已经把这个页面原来"筛选"图标背后绑定的州下拉框整个删掉了（见
 *   上一段），读代码确认过现在这个位置不再挂着任何功能——14 号卡任务卡里
 *   提到的"顶部栏右侧 ▽ 图标"在当前代码里已经不存在，没有需要迁移或保留
 *   的功能，这次改版前后对得上号的只是"右侧一个图标按钮"这个视觉位置，
 *   不是同一个图标/同一份逻辑。
 * - 搜索图标目前还没有对应的后端搜索能力（activities-repository.ts /
 *   useActivitiesQuery 都没有 searchQuery 参数，这次任务卡也没有要求新增
 *   一套搜索筛选逻辑——明确写的是"纯前端视觉改动"）。onSearchClick 这次
 *   只做"跟首页搜索图标同一套显隐开关"（isSearchOpen 本地 state + 一个
 *   输入框），不接任何过滤逻辑——不给一个完全不响应点击的图标按钮，但也
 *   不擅自多做一套本卡没要求的搜索筛选功能；这部分输入框以后要不要真的
 *   接一套找搭子搜索，交给专门的任务卡决定。
 */
export function ActivityListPage() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<string>("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);

  const { data: activities, isPending, isError } = useActivitiesQuery({
    channel: channel || undefined,
    stateCode: selectedRegion?.stateCode
  });
  const { data: participantPreviews } = useActivityParticipantPreviewsQuery(
    (activities ?? []).map((activity) => activity.id)
  );

  const inactivePillClassName =
    "flex h-11 items-center justify-center rounded-full border border-border bg-bg px-4 text-sm whitespace-nowrap text-text-muted";
  const activePillClassName =
    "flex h-11 items-center justify-center rounded-full px-4 text-sm whitespace-nowrap bg-accent text-white font-semibold";

  // 08 号卡 8.4：选中了某个州（且没有额外叠加频道筛选）但这个州压根没有
  // 任何活动时，展示专门的"发起第一个"引导，而不是通用的"换个筛选条件试试"
  // 文案——后者暗示"筛选条件可能不对"，但这里更准确的原因是"这个地区还没
  // 有内容"。限定 channel === ""（没有额外选中某个具体频道）是因为"这个
  // 地区还没有搭子活动"这句话必须在"没有任何频道过滤"的前提下才是准确的：
  // 如果用户同时选了某个频道，零结果更可能是"这个地区有活动、只是不是这个
  // 频道"，那种情况用回下面的通用文案更贴切，不应该误导用户以为整个地区
  // 都没有内容。
  const isRegionEmptyState =
    !isPending && !isError && activities && activities.length === 0 && channel === "" && selectedRegion;

  return (
    <main data-testid="activity-list-page" className="pb-24">
      <TopBar
        variant="home"
        regionLabel={selectedRegion ? formatSelectedRegionLabel(selectedRegion) : null}
        onRegionClick={() => navigate(REGION_SELECT_PATH)}
        onSearchClick={() => setIsSearchOpen((current) => !current)}
      />

      {isSearchOpen ? (
        <div className="px-4 pb-2">
          <input
            type="search"
            autoFocus
            placeholder="搜找搭子活动…"
            className="h-13 w-full rounded-search border border-border bg-card px-4 text-base text-text shadow-search"
          />
        </div>
      ) : null}

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

        {isPending ? <p role="status">加载中…</p> : null}
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

        {!isPending && !isError && activities && activities.length === 0 && !isRegionEmptyState ? (
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

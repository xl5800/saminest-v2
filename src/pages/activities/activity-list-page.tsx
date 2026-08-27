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
import { useDebouncedValue } from "../../utils/use-debounced-value";

const REGION_SELECT_PATH = "/region-select";
// 跟 home-page.tsx 的 SEARCH_DEBOUNCE_MS 用同一个值——18 号卡明确要求"复用
// 首页同款的 debounce 模式"，这里没有理由取一个不同的延迟数字。
const SEARCH_DEBOUNCE_MS = 400;

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
 * - 搜索图标 14 号卡上线时只是纯开关（isSearchOpen + 一个不接筛选逻辑的
 *   输入框），18 号卡在此基础上把筛选真正接上，见下面 18 号卡的说明段落。
 *
 * 18 号卡（找搭子搜索按钮真正生效）：
 * - 按标题客户端筛选——活动数据本来就是 useActivitiesQuery 一次性整批拉
 *   下来的（不分页），不需要新增 searchQuery 参数传给后端/数据库，直接在
 *   已经查回来的 activities 数组上再 filter 一层标题子串匹配即可。防抖
 *   （inputValue → debouncedSearchQuery）复用 useDebouncedValue，跟
 *   home-page.tsx 的搜索框是同一个 hook、同一个 SEARCH_DEBOUNCE_MS 数值，
 *   没有另外写一套防抖逻辑。
 * - 跟分类 Tab（channel）的关系：读代码确认 channel 筛选是通过
 *   useActivitiesQuery 的参数传给后端做服务端过滤的（真正的 SQL
 *   where 条件），不是客户端过滤；这次新加的关键字筛选在服务端返回的
 *   activities 数组基础上再叠一层客户端 filter，天然就是"分类 AND
 *   关键字"——不需要、也不应该把 channel 和 debouncedSearchQuery 揉进
 *   同一个 state 或者互相清空对方，两者各自管各自的过滤维度，只是
 *   filter 链的先后两级。isRegionEmptyState（"这个地区还没有搭子活动"
 *   引导文案）判断依旧只看服务端过滤后的原始 activities.length，不受
 *   关键字影响——关键字把结果筛没了属于"没有符合条件的活动，换个筛选
 *   条件试试"，不是"这个地区真的没有活动"，两种空态文案不能混。
 * - 收起搜索框（点击搜索图标关闭）时清空 inputValue，恢复完整列表——跟
 *   home-page.tsx 的 handleToggleSearch 同一个做法，不用等用户自己删完
 *   输入框内容。
 */
export function ActivityListPage() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<string>("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const debouncedSearchQuery = useDebouncedValue(inputValue, SEARCH_DEBOUNCE_MS);
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);

  const { data: activities, isPending, isError } = useActivitiesQuery({
    channel: channel || undefined,
    stateCode: selectedRegion?.stateCode
  });
  // 关键字筛选是纯客户端的一层再过滤，键还是用未过滤的 activities（不是
  // visibleActivities）——预览数据跟标题关键字无关，用完整列表查一次就
  // 够了，不需要每敲一个字就重新算一遍批量查询的参数。
  const { data: participantPreviews } = useActivityParticipantPreviewsQuery(
    (activities ?? []).map((activity) => activity.id)
  );

  const trimmedQuery = debouncedSearchQuery.trim().toLowerCase();
  const visibleActivities = trimmedQuery
    ? (activities ?? []).filter((activity) => activity.title.toLowerCase().includes(trimmedQuery))
    : activities;

  function handleToggleSearch(): void {
    setIsSearchOpen((current) => {
      const next = !current;
      if (!next) {
        setInputValue("");
      }
      return next;
    });
  }

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
  // 都没有内容。18 号卡：这里故意继续只看服务端过滤后的原始 activities
  // （不是 visibleActivities），关键字筛没了结果不代表"这个地区没有活动"，
  // 那种情况应该走下面的通用空态文案，不能触发这条"发起第一个"引导。
  const isRegionEmptyState =
    !isPending && !isError && activities && activities.length === 0 && channel === "" && selectedRegion;

  return (
    <main data-testid="activity-list-page" className="pb-24">
      <TopBar
        variant="home"
        regionLabel={selectedRegion ? formatSelectedRegionLabel(selectedRegion) : null}
        onRegionClick={() => navigate(REGION_SELECT_PATH)}
        onSearchClick={handleToggleSearch}
      />

      {isSearchOpen ? (
        <div className="px-4 pb-2">
          <input
            type="search"
            autoFocus
            placeholder="搜找搭子活动…"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
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
      </div>

      <Fab label="发起搭子" variant="dark" onClick={() => navigate("/activities/new")} />
    </main>
  );
}

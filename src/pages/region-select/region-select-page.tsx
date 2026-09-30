import { Globe } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { formatStateLabel, US_STATES, type UsState } from "../../data/us-states";
import { useCitiesWithStateQuery } from "../../features/locations/use-cities-with-state-query";
import { useRegionContentCountsQuery } from "../../features/locations/use-region-content-counts-query";
import type { LocationWithStateItem } from "../../repositories/locations-repository";
import { usePendingFormRegionStore } from "../../store/pending-form-region-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";

type SortMode = "popularity" | "alphabetical";

interface StateRow {
  code: string;
  name: string;
  /** 中文州名（12 号卡新增）——跟 code 一起喂给 formatStateLabel() 拼展示
   *  文案，见下面渲染州列表的地方。 */
  nameZh: string;
  /** 这个州在 locations 表里已有的真实城市（可能是空数组——全美 51 项里
   *  绝大多数州目前是这种情况）。发布表单选地区，VA/MD 都不再下钻任务卡
   *  起，这个字段不再参与任何点击行为/渲染判断（点击一律直接选中整个州，
   *  不再下钻），继续查出来只是没有必要为了这一件事改 stateRows 的构造，
   *  见组件顶部注释。 */
  cities: LocationWithStateItem[];
}

/** 搜索结果里每一行都渲染成同一种扁平、可直接点击的行——发布表单选地区，
 *  VA/MD 都不再下钻任务卡起，搜索结果只会命中州（不再匹配/展示城市名，
 *  见 searchResults 的注释），这个类型本身还是通用的"可选中条目"形状，
 *  不特意收窄成"州专用"，避免以后搜索需求变化时又要改一次类型定义。 */
interface SelectableEntry {
  key: string;
  name: string;
  onSelect: () => void;
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "popularity", label: "按热度" },
  { value: "alphabetical", label: "按字母" }
];

function sortByMode<T extends { name: string }>(items: T[], mode: SortMode): T[] {
  if (mode === "popularity") return items;
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 51 项州列表专用的排序——跟上面通用的 sortByMode 不是同一个函数，因为
 * "按热度"对州列表有真实定义（按 useRegionContentCountsQuery 给出的活跃
 * 内容数量降序），但对城市/搜索结果列表没有（那两处的"按热度"维持 08 号卡
 * 之前就有的行为：不重排，就是数据原本的顺序，见 sortByMode 的实现——
 * 这不是疏漏，08 号卡任务卡原文的"按热度"定义明确是"按该州..."，是一个
 * 州级别的概念，没有要求重新定义城市/搜索结果的热度排序）。
 *
 * 数量并列（含最常见的"都是 0"）时退到字母序——降序比较 0 时自然会走到
 * 这一分支，不需要专门判断"是不是都是 0"这种情况，见任务卡"不需要精确的
 * 并列排序策略，这条兜底规则够用"。
 */
function sortStateRows(rows: StateRow[], mode: SortMode, contentCounts: Map<string, number>): StateRow[] {
  if (mode === "alphabetical") {
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...rows].sort((a, b) => {
    const countDiff = (contentCounts.get(b.code) ?? 0) - (contentCounts.get(a.code) ?? 0);
    if (countDiff !== 0) return countDiff;
    return a.name.localeCompare(b.name);
  });
}

/**
 * 08 号卡「地区选择」页（/region-select，从首页顶部胶囊按钮点击进入，见
 * home-page.tsx 的 REGION_SELECT_PATH）。
 *
 * 全美 51 项州列表（50 州 + DC）来自静态数据 src/data/us-states.ts，不再是
 * 06 号卡时期"只查 locations 表里已有的 3 条 type = 'state' 行"。
 *
 * 发布表单选地区，VA/MD 都不再下钻任务卡起，点击任意一个州行都直接
 * selectState(row) 选中整个州本身（cityId/cityName 写 null）——不管这个州
 * 在 locations 表里有没有真实城市数据，也不再展示右侧 chevron。这个页面
 * 曾经有一整套"根据城市数量决定点击行为"的下钻交互（06/08 号卡定的规则：
 * 城市数 > 1 下钻到具体城市列表，正好 1 个城市自动选中那个城市，0 个城市
 * 才直接选中整个州），「地区筛选栏暂时只精确到州」任务卡先把这套交互收窄
 * 成只对筛选场景生效，这次连表单场景也一并去掉——两个场景的点击行为重新
 * 变得完全一样，页面内不再有任何下钻态，drilldownCode 这套 state、它的
 * 渲染分支、TopBar 在下钻态下的 onBack 特殊处理（原来切回州列表而不是
 * navigate(-1)）都已经删掉，不留死代码。stateRows 上的 cities 字段仍然从
 * useCitiesWithStateQuery() 查出来，但目前不参与任何点击行为/渲染判断，
 * 见该字段上的注释。
 *
 * "全美"是列表最上方一个独立的固定项，不属于下面 51 项、不参与排序/搜索，
 * 只在最外层的州列表视图展示（搜索结果视图不展示）——选中它清除
 * useSelectedRegionStore 里的选中地区（selected-region-store.ts 的
 * clearSelectedRegion），首页/找搭子恢复展示全部内容。
 *
 * 搜索框按 06 号卡"保留原有结构"的要求接入，08 号卡把它"扩展到能搜索全部
 * 51 项"——匹配 51 州的名字/两字母缩写/中文州名（不再匹配城市名，见发布
 * 表单选地区，VA/MD 都不再下钻任务卡起 searchResults 的注释）。没有专门的
 * 地址地理编码/模糊搜索服务可用，用最简单的子串匹配已经能覆盖"找一个我
 * 知道具体名字的地区"这个使用场景。
 *
 * "全部城市"是设计稿里的静态分组标题（不是按钮/切换），"按热度｜按字母"
 * 才是真正的排序切换——见 saminest_final_screens.html 屏 ⑪ 的 DOM 结构
 * （.lbl 纯文字 + .tabs 里两个 span.t 才带 active 态）。这个切换统一作用于
 * 当前正在展示的那一份列表（州列表 / 搜索结果），不是只对某一种列表
 * 生效——州列表用 sortStateRows（真实按内容数量排序），搜索结果继续用
 * sortByMode（见该函数上方注释）。
 *
 * 选中后写入对应 store 并 navigate(-1) 返回上一页——跟 TopBar 默认返回
 * 按钮是同一个"回到进入这个页面之前那一页"的语义，不假设一定是首页。
 *
 * 12 号卡「地区选择格式统一 + 全局复用」新增"场景"支持，用一个 URL 查询
 * 参数 `?mode=form` 区分：
 * - 默认（不传/其它值）＝筛选场景（首页顶部胶囊、找搭子列表筛选入口），
 *   展示"全美"、选中后写入 useSelectedRegionStore（这是"我现在想浏览哪个
 *   地区"，全局、持久化）。
 * - `mode=form` ＝发布表单选地区场景（发起搭子/发布租房/求租/二手），
 *   不展示"全美"（发帖子/发活动必须选一个具体的州，不能选"全美"，"不限
 *   地区"是这几个表单自己的字段语义，不是这个页面的选项，见各表单自己的
 *   实现）；选中后写入 usePendingFormRegionStore 而不是
 *   useSelectedRegionStore——这是"我这次在表单里选了哪个地区"，一次性、
 *   不该影响首页/找搭子正在生效的筛选，见 pending-form-region-store.ts
 *   顶部注释。发布表单选地区，VA/MD 都不再下钻任务卡起，isFormMode 只
 *   决定"写入哪个 store / 要不要展示全美"这两件事，不再影响列表/搜索/
 *   点击行为——「地区筛选栏暂时只精确到州」任务卡当时留下的"isFormMode
 *   还控制能不能下钻到城市"这条差异，到这张任务卡为止已经不存在了，两种
 *   场景的列表/搜索/点击行为重新完全一样。
 */
export function RegionSelectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFormMode = searchParams.get("mode") === "form";
  const setSelectedRegion = useSelectedRegionStore((s) => s.setSelectedRegion);
  const clearSelectedRegion = useSelectedRegionStore((s) => s.clearSelectedRegion);
  const setPendingRegion = usePendingFormRegionStore((s) => s.setPendingRegion);

  const {
    data: cities,
    isPending: isCitiesPending,
    isError: isCitiesError
  } = useCitiesWithStateQuery();
  const {
    data: contentCounts,
    isPending: isContentCountsPending,
    isError: isContentCountsError
  } = useRegionContentCountsQuery();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("popularity");

  const stateRows: StateRow[] = useMemo(() => {
    if (!cities) return [];
    return US_STATES.map((state) => ({
      code: state.code,
      name: state.name,
      nameZh: state.nameZh,
      cities: cities.filter((city) => city.stateCode === state.code)
    }));
  }, [cities]);

  const sortedStateRows = useMemo(
    () => sortStateRows(stateRows, sortMode, contentCounts ?? new Map()),
    [stateRows, sortMode, contentCounts]
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();
  // 08 号卡：搜索扩展到全部 51 项——州名/两字母缩写用 US_STATES 这份静态
  // 数据匹配（不依赖已加载的 cities/stateRows）。12 号卡：展示格式统一成
  // 中文后，搜索词也顺带支持匹配中文州名（比如输入"纽约"能搜到 NY）——
  // 展示的是中文，搜不出中文会显得像 bug，这条不是单独的任务卡要求，是
  // 格式改成中文后自然需要配套的行为。
  //
  // 发布表单选地区，VA/MD 都不再下钻任务卡：搜索结果不再额外匹配/展示
  // 城市名——表单场景之前还保留"搜城市名"这条（地区筛选栏暂时只精确到州
  // 任务卡当时只收窄了筛选场景），这次表单场景也统一成只搜州名/缩写/
  // 中文州名，两个场景的搜索结果完全一样，不再按 isFormMode 分流。
  const searchResults: SelectableEntry[] | null = useMemo(() => {
    if (!trimmedQuery) return null;

    const matchedStates: SelectableEntry[] = US_STATES.filter(
      (state) =>
        state.name.toLowerCase().includes(trimmedQuery) ||
        state.code.toLowerCase().includes(trimmedQuery) ||
        state.nameZh.includes(trimmedQuery)
    ).map((state) => ({
      key: `state-${state.code}`,
      name: formatStateLabel(state),
      onSelect: () => selectState(state)
    }));

    return sortByMode(matchedStates, sortMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery, sortMode]);

  function selectState(state: UsState): void {
    const region = {
      stateCode: state.code,
      stateName: state.name,
      cityId: null,
      cityName: null
    };
    if (isFormMode) {
      setPendingRegion(region);
    } else {
      setSelectedRegion(region);
    }
    navigate(-1);
  }

  function handleSelectNationwide(): void {
    clearSelectedRegion();
    navigate(-1);
  }

  // 发布表单选地区，VA/MD 都不再下钻任务卡：表单场景（isFormMode）原本
  // 还保留"下钻 / 自动选中唯一城市"这一整套（地区筛选栏暂时只精确到州
  // 任务卡当时只收窄了筛选场景），这次把表单场景也改成跟筛选场景一样
  // 一律直接 selectState(row)——两个场景的点击行为合并成完全一样，不再
  // 区分 isFormMode。
  function handleStateRowClick(row: StateRow): void {
    selectState(row);
  }

  const isPending = isCitiesPending || isContentCountsPending;
  const isError = isCitiesError || isContentCountsError;

  return (
    <main data-testid="region-select-page">
      <TopBar variant="nav-only" title="地区选择" />

      <div className="mx-auto max-w-2xl px-4 pb-6">
        <input
          type="search"
          placeholder="请输入地址搜索"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="mt-3 h-13 w-full rounded-search border border-border bg-card px-4 text-base text-text shadow-search"
        />

        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-sm font-medium text-text-muted">全部城市</span>
          <div className="flex items-center gap-2 text-sm">
            {SORT_OPTIONS.map((option, index) => (
              <span key={option.value} className="flex items-center gap-2">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-text-subtle">
                    |
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-pressed={sortMode === option.value}
                  onClick={() => setSortMode(option.value)}
                  className={
                    sortMode === option.value
                      ? "font-semibold text-primary"
                      : "text-text-muted"
                  }
                >
                  {option.label}
                </button>
              </span>
            ))}
          </div>
        </div>

        {isPending ? (
          <p role="status" className="mt-4 text-sm text-text-muted">
            加载中…
          </p>
        ) : null}
        {isError ? (
          <p
            role="alert"
            className="mt-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            地区加载失败，请稍后重试。
          </p>
        ) : null}

        {!isPending && !isError ? (
          // 全 App 视觉 Token 体系（第二批）：分割线从 divide-border（卡片
          // 边框语义）换成 divide-divider（列表分割线专用），跟第一批
          // conversation-list-page.tsx 同一个处理——这里的行与行之间是
          // 列表分割线场景，不是卡片边框场景。容器圆角维持 rounded-2xl
          // （16px）不变：这是一个次要的选择列表容器，不是帖子/找搭子那类
          // 主力曝光位卡片，不套用 rounded-card-lg。
          <ul className="mt-3 divide-y divide-divider rounded-2xl bg-card">
            {/* 「全美」只在最外层的州列表视图展示——不属于 51 项、不参与
                排序/搜索，见组件顶部注释；12 号卡起额外要求 form 场景
                （发布表单选地区）完全不展示这个选项。 */}
            {!isFormMode && !searchResults ? (
              <li>
                <button
                  type="button"
                  onClick={handleSelectNationwide}
                  className="flex h-12 w-full items-center gap-2 px-4 text-left text-base font-medium text-text"
                >
                  <Globe aria-hidden="true" size={18} className="text-primary" />
                  全美
                </button>
              </li>
            ) : null}

            {searchResults ? (
              searchResults.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-text-muted">
                  没有找到匹配的地区。
                </li>
              ) : (
                searchResults.map((entry) => (
                  <li key={entry.key}>
                    <button
                      type="button"
                      onClick={entry.onSelect}
                      className="flex h-12 w-full items-center px-4 text-left text-base text-text"
                    >
                      {entry.name}
                    </button>
                  </li>
                ))
              )
            ) : (
              sortedStateRows.map((row) => (
                <li key={row.code}>
                  <button
                    type="button"
                    onClick={() => handleStateRowClick(row)}
                    className="flex h-12 w-full items-center justify-between px-4 text-left text-base text-text"
                  >
                    <span>{formatStateLabel(row)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </main>
  );
}

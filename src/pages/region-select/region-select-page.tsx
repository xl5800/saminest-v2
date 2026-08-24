import { ChevronRight, Globe } from "lucide-react";
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
   *  绝大多数州目前是这种情况）。长度决定这一行是"下钻"还是"直接选中"，
   *  见 handleStateRowClick。 */
  cities: LocationWithStateItem[];
}

/** 搜索结果 / 下钻城市列表里，每一行不区分是"州"还是"城市"，都渲染成
 *  同一种扁平、可直接点击的行——搜索结果本来就是"跟州列表/下钻列表平级的
 *  第三种展示态（扁平列表，不分州）"，见下面 buildSearchResults 的注释。 */
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

function findStateName(code: string): string {
  return US_STATES.find((state) => state.code === code)?.name ?? code;
}

/**
 * 08 号卡「地区选择」页（/region-select，从首页顶部胶囊按钮点击进入，见
 * home-page.tsx 的 REGION_SELECT_PATH）。
 *
 * 全美 51 项州列表（50 州 + DC）来自静态数据 src/data/us-states.ts，不再是
 * 06 号卡时期"只查 locations 表里已有的 3 条 type = 'state' 行"——那 3 条
 * 行（DC/VA/MD）现在只用来判断"这个州有没有真实城市数据"（跟
 * useCitiesWithStateQuery() 返回的城市按 stateCode 分组交叉比对），不再
 * 决定"列表里展示哪些州"，见 stateRows 的构造。
 *
 * 有真实城市数据的州（目前是 DC/VA/MD 里城市数 > 1 的 VA/MD）保留右侧
 * chevron，点进去下钻到具体城市；只有 1 个城市的州（目前是 DC）直接选中
 * 那一个城市；0 个城市的州（其余 47 项）直接选中整个州本身——这条"有几个
 * 城市决定点击行为"的规则完全沿用 06 号卡已经定的判断（cities.length > 1
 * 才下钻），不是新规则，08 号卡只是把它应用到 51 项而不是 3 项，"以后哪个
 * 州有了真实城市数据，自动会出现下钻箭头"这条也是因为这个规则本身就是
 * 数据驱动的，不是写死某几个州代码。
 *
 * "全美"是列表最上方一个独立的固定项，不属于下面 51 项、不参与排序/搜索，
 * 只在最外层的州列表视图展示（下钻/搜索结果视图不展示）——选中它清除
 * useSelectedRegionStore 里的选中地区（第一次给这个 store 补上"取消选择"
 * 的能力，见 selected-region-store.ts 的 clearSelectedRegion），首页/找
 * 搭子恢复展示全部内容。
 *
 * 下钻用页面内 state（drilldownCode），不是新开一个路由——设计稿里"地区
 * 选择"就是一张屏，下钻是同一屏内的列表切换，不需要 /region-select/:code
 * 这样的子路由；TopBar 的 onBack 在下钻态时改成"返回州列表"而不是离开
 * 整个页面（默认的 navigate(-1) 行为会直接跳出这个页面，回到首页，不是
 * 用户在下钻态点"返回"时想要的结果）。
 *
 * 搜索框按 06 号卡"保留原有结构"的要求接入，08 号卡把它"扩展到能搜索全部
 * 51 项"——原来只在城市名字里子串匹配，现在同时匹配 51 州的名字/两字母
 * 缩写（州名/城市名分别匹配，不是把所有名字拼一起模糊搜），命中的州和
 * 命中的城市合并成同一个扁平列表，跟"州列表/下钻列表"平级，是第三种展示
 * 态，有搜索词时优先展示这个态，忽略当前是不是处于下钻。没有专门的地址
 * 地理编码/模糊搜索服务可用，用最简单的子串匹配已经能覆盖"找一个我知道
 * 具体名字的地区"这个使用场景。
 *
 * "全部城市"是设计稿里的静态分组标题（不是按钮/切换），"按热度｜按字母"
 * 才是真正的排序切换——见 saminest_final_screens.html 屏 ⑪ 的 DOM 结构
 * （.lbl 纯文字 + .tabs 里两个 span.t 才带 active 态）。这个切换统一作用于
 * 当前正在展示的那一份列表（州列表 / 下钻城市列表 / 搜索结果），不是只对
 * 某一种列表生效——州列表用 sortStateRows（真实按内容数量排序），其余两
 * 种列表继续用 sortByMode（见该函数上方注释）。
 *
 * 选中后写入对应 store 并 navigate(-1) 返回上一页——跟 TopBar 默认返回
 * 按钮是同一个"回到进入这个页面之前那一页"的语义，不假设一定是首页。
 *
 * 12 号卡「地区选择格式统一 + 全局复用」新增"场景"支持，用一个 URL 查询
 * 参数 `?mode=form` 区分：
 * - 默认（不传/其它值）＝筛选场景（首页顶部胶囊、找搭子列表筛选入口），
 *   跟 08 号卡之前完全一样——展示"全美"、选中后写入 useSelectedRegionStore
 *   （这是"我现在想浏览哪个地区"，全局、持久化）。
 * - `mode=form` ＝发布表单选地区场景（发起搭子/发布租房/求租/二手），
 *   不展示"全美"（发帖子/发活动必须选一个具体的州，不能选"全美"，"不限
 *   地区"是这几个表单自己的字段语义，不是这个页面的选项，见各表单自己的
 *   实现）；选中后写入 usePendingFormRegionStore 而不是
 *   useSelectedRegionStore——这是"我这次在表单里选了哪个地区"，一次性、
 *   不该影响首页/找搭子正在生效的筛选，见 pending-form-region-store.ts
 *   顶部注释。除了写入哪个 store、要不要展示"全美"这两点，两种场景下的
 *   列表/搜索/排序/下钻逻辑完全一样，不是两份重复代码。
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
  const [drilldownCode, setDrilldownCode] = useState<string | null>(null);

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

  const drilldownGroup = drilldownCode
    ? (stateRows.find((row) => row.code === drilldownCode) ?? null)
    : null;

  const trimmedQuery = searchQuery.trim().toLowerCase();
  // 08 号卡：搜索扩展到全部 51 项——州名/两字母缩写、城市名分别匹配，命中
  // 的合并成一个扁平列表。州名/缩写用 US_STATES 这份静态数据匹配（不依赖
  // 已加载的 cities/stateRows），城市继续用 useCitiesWithStateQuery 的结果。
  // 12 号卡：展示格式统一成中文后，搜索词也顺带支持匹配中文州名（比如输入
  // "纽约"能搜到 NY）——展示的是中文，搜不出中文会显得像 bug，这条不是
  // 单独的任务卡要求，是格式改成中文后自然需要配套的行为。
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

    const matchedCities: SelectableEntry[] = (cities ?? [])
      .filter((city) => city.name.toLowerCase().includes(trimmedQuery))
      .map((city) => ({
        key: city.id,
        name: city.name,
        onSelect: () => selectCity(city, city.stateCode ?? "")
      }));

    return sortByMode([...matchedStates, ...matchedCities], sortMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, trimmedQuery, sortMode]);

  function selectCity(city: LocationWithStateItem, stateCode: string): void {
    const region = {
      stateCode,
      stateName: findStateName(stateCode),
      cityId: city.id,
      cityName: city.name
    };
    if (isFormMode) {
      setPendingRegion(region);
    } else {
      setSelectedRegion(region);
    }
    navigate(-1);
  }

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

  function handleStateRowClick(row: StateRow): void {
    if (row.cities.length > 1) {
      setDrilldownCode(row.code);
      return;
    }
    const onlyCity = row.cities[0];
    if (onlyCity) {
      selectCity(onlyCity, row.code);
      return;
    }
    selectState(row);
  }

  const isPending = isCitiesPending || isContentCountsPending;
  const isError = isCitiesError || isContentCountsError;

  return (
    <main data-testid="region-select-page">
      <TopBar
        variant="nav-only"
        title="地区选择"
        onBack={drilldownGroup ? () => setDrilldownCode(null) : undefined}
      />

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
          <ul className="mt-3 divide-y divide-border rounded-2xl bg-card">
            {/* 「全美」只在最外层的州列表视图展示——不属于 51 项、不参与
                排序/搜索，见组件顶部注释；12 号卡起额外要求 form 场景
                （发布表单选地区）完全不展示这个选项。 */}
            {!isFormMode && !searchResults && !drilldownGroup ? (
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
            ) : drilldownGroup ? (
              sortByMode(drilldownGroup.cities, sortMode).map((city) => (
                <li key={city.id}>
                  <button
                    type="button"
                    onClick={() => selectCity(city, drilldownGroup.code)}
                    className="flex h-12 w-full items-center px-4 text-left text-base text-text"
                  >
                    {city.name}
                  </button>
                </li>
              ))
            ) : (
              sortedStateRows.map((row) => (
                <li key={row.code}>
                  <button
                    type="button"
                    onClick={() => handleStateRowClick(row)}
                    className="flex h-12 w-full items-center justify-between px-4 text-left text-base text-text"
                  >
                    <span>{formatStateLabel(row)}</span>
                    {row.cities.length > 1 ? (
                      <ChevronRight aria-hidden="true" size={18} className="text-chevron" />
                    ) : null}
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

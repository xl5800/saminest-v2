import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { useActivityRegionsQuery } from "../../features/locations/use-activity-regions-query";
import { useCitiesWithStateQuery } from "../../features/locations/use-cities-with-state-query";
import type { LocationWithStateItem } from "../../repositories/locations-repository";
import { useSelectedRegionStore } from "../../store/selected-region-store";

type SortMode = "popularity" | "alphabetical";

interface StateGroup {
  /** 州代码，同时也是展示文案——复用 useActivityRegionsQuery() 现有的 3 条
   *  type = 'state' 行的 name（'DC' / 'VA' / 'MD'，见 locations-repository.ts
   *  顶部注释），不新造一套"纽约州/加利福尼亚州"这种长名——设计稿参考的是
   *  全美 50 州场景，这个项目目前只服务 DMV 三个州，"找搭子"页的州筛选
   *  下拉框已经在用同一份数据、同样只显示缩写，这里沿用同一个展示约定，
   *  不新增一套长名映射（那属于任务卡范围之外的产品决策）。 */
  code: string;
  cities: LocationWithStateItem[];
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
 * 06 号卡「地区选择」页（/region-select，从首页顶部州名点击进入，见
 * home-page.tsx 的 REGION_SELECT_PATH）。
 *
 * 数据模型跟设计稿（saminest_final_screens.html 屏 ⑪，NY/CA/TX/HI/WA/
 * MA/NJ 这种全美多州场景）不是 1:1 照搬——这个项目目前只服务 DMV 三个州
 * （locations 表种子数据只有 DC/VA/MD，见 20260816223226_add_activity_
 * region_locations.sql），没有全美 50 州的数据源，也不在这张卡的范围内
 * 新建一个。这里复用已有的两个只读查询拼出"州 -> 城市列表"的分组结构：
 * useActivityRegionsQuery()（3 条 type = 'state' 行，决定州的顺序/展示名）
 * + useCitiesWithStateQuery()（14 条 type = 'city' 行，每行带 state_code）。
 * DC 底下只有 1 个城市（Washington, DC 本身），天然落在"单一地区的州"分支
 * （直接点击选中、不带 chevron）；VA/MD 各有多个城市，落在"多城市州"分支
 * （带 chevron 下钻），跟任务卡"NY、CA 这类多城市州带下钻箭头，其余单一
 * 地区的州直接点击即选中"的验收标准是同一个判断规则，只是用真实的
 * DMV 数据代入，不是 46 个字面意义上的其它州。
 *
 * 下钻用页面内 state（drilldownCode），不是新开一个路由——设计稿里"地区
 * 选择"就是一张屏，下钻是同一屏内的列表切换，不需要 /region-select/:code
 * 这样的子路由；TopBar 的 onBack 在下钻态时改成"返回州列表"而不是离开
 * 整个页面（默认的 navigate(-1) 行为会直接跳出这个页面，回到首页，不是
 * 用户在下钻态点"返回"时想要的结果）。
 *
 * 搜索框按 06 号卡"保留原有结构"的要求接入：在城市全集里按名字子串匹配，
 * 匹配结果是一个跟"州列表/下钻列表"平级的第三种展示态（扁平城市列表，
 * 不分州），有搜索词时优先展示这个态，忽略当前是不是处于下钻——没有专门
 * 的地址地理编码/模糊搜索服务可用，用最简单的子串匹配已经能覆盖"找一个
 * 我知道具体名字的城市"这个使用场景。
 *
 * "全部城市"是设计稿里的静态分组标题（不是按钮/切换），"按热度｜按字母"
 * 才是真正的排序切换——见 saminest_final_screens.html 屏 ⑪ 的 DOM 结构
 * （.lbl 纯文字 + .tabs 里两个 span.t 才带 active 态）。这个切换统一作用于
 * 当前正在展示的那一份列表（州列表 / 下钻城市列表 / 搜索结果），不是只对
 * 某一种列表生效——用同一个 sortByMode() helper 处理三处，保证排序规则
 * 一致。
 *
 * 选中后写入 useSelectedRegionStore（06 号卡新建的纯前端持久化数据源，见
 * 该文件顶部注释）并 navigate(-1) 返回上一页——跟 TopBar 默认返回按钮是
 * 同一个"回到进入这个页面之前那一页"的语义，不假设一定是首页（虽然目前
 * 唯一入口确实是首页）。
 */
export function RegionSelectPage() {
  const navigate = useNavigate();
  const setSelectedRegion = useSelectedRegionStore((s) => s.setSelectedRegion);

  const {
    data: states,
    isPending: isStatesPending,
    isError: isStatesError
  } = useActivityRegionsQuery();
  const {
    data: cities,
    isPending: isCitiesPending,
    isError: isCitiesError
  } = useCitiesWithStateQuery();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("popularity");
  const [drilldownCode, setDrilldownCode] = useState<string | null>(null);

  const groups: StateGroup[] = useMemo(() => {
    if (!states || !cities) return [];
    return states.map((state) => ({
      code: state.name,
      cities: cities.filter((city) => city.stateCode === state.name)
    }));
  }, [states, cities]);

  const sortedGroups = useMemo(
    () => (sortMode === "popularity" ? groups : [...groups].sort((a, b) => a.code.localeCompare(b.code))),
    [groups, sortMode]
  );

  const drilldownGroup = drilldownCode
    ? (sortedGroups.find((group) => group.code === drilldownCode) ?? null)
    : null;

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!trimmedQuery || !cities) return null;
    const matched = cities.filter((city) => city.name.toLowerCase().includes(trimmedQuery));
    return sortByMode(matched, sortMode);
  }, [cities, trimmedQuery, sortMode]);

  function selectCity(city: LocationWithStateItem, stateCode: string): void {
    setSelectedRegion({ cityId: city.id, cityName: city.name, stateCode });
    navigate(-1);
  }

  function handleStateRowClick(group: StateGroup): void {
    if (group.cities.length <= 1) {
      const onlyCity = group.cities[0];
      if (onlyCity) selectCity(onlyCity, group.code);
      return;
    }
    setDrilldownCode(group.code);
  }

  const isPending = isStatesPending || isCitiesPending;
  const isError = isStatesError || isCitiesError;

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
            {searchResults ? (
              searchResults.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-text-muted">
                  没有找到匹配的地区。
                </li>
              ) : (
                searchResults.map((city) => (
                  <li key={city.id}>
                    <button
                      type="button"
                      onClick={() => selectCity(city, city.stateCode ?? "")}
                      className="flex h-12 w-full items-center px-4 text-left text-base text-text"
                    >
                      {city.name}
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
              sortedGroups.map((group) => (
                <li key={group.code}>
                  <button
                    type="button"
                    onClick={() => handleStateRowClick(group)}
                    className="flex h-12 w-full items-center justify-between px-4 text-left text-base text-text"
                  >
                    <span>{group.code}</span>
                    {group.cities.length > 1 ? (
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

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PublishActionSheet } from "../../components/publish-action-sheet";
import { TopBar } from "../../components/top-bar";
import { formatStateLabelByCode } from "../../data/us-states";
import { CategoryNav } from "../../features/categories/category-nav";
import { useCategoriesQuery } from "../../features/categories/use-categories-query";
import { PostList } from "../../features/posts/post-list";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { useDebouncedValue } from "../../utils/use-debounced-value";

const SEARCH_DEBOUNCE_MS = 400;

/**
 * 06 号卡（地区选择）已经落地"用户当前选中的州"这个数据源
 * （useSelectedRegionStore，纯前端 localStorage 持久化，见该文件顶部
 * 注释），这里换成读那个 store，不再是写死的 null——跟
 * useActivityRegionsQuery（"找搭子"列表筛选用的独立数据源）没有任何关系。
 * store 里还没选过地区（游客/新用户第一次进来）时 selectedRegion 是
 * null，TopBar 的 home 变体在 stateName 为 null 时只显示"Saminest"，
 * 不会有孤零零的"· "分隔符，见 top-bar.tsx，这条行为跟 06 号卡之前的占位
 * 实现完全一致，只是数据源从写死的 null 换成了"可能是 null 的真实状态"。
 */
const REGION_SELECT_PATH = "/region-select";

/**
 * 08 号卡：TopBar home 变体胶囊按钮第二行的展示文案。有具体城市数据时
 * （目前只有 DC/VA/MD 三州，用户下钻选了具体某个城市）用"{城市名}, {州
 * 代码}"——精确复刻 Meet5 参考截图"Woodbridge, VA"这个格式，城市名本身
 * 不翻译（12 号卡明确"城市名称不用加中文翻译"）；其余大多数州没有城市可选、
 * 直接选中整个州时没有 cityName 可用，12 号卡起改成"缩写 + 中文州名"
 * （如"CA 加利福尼亚州"），不再展示英文全名——全站统一格式，见
 * us-states.ts 的 formatStateLabelByCode。这个格式化逻辑只有首页这一个
 * 消费者，就地写成一个小函数，不提到 selected-region-store.ts 里——那个
 * store 只负责存数据，不应该背上"怎么格式化展示"这种表现层逻辑。
 */
function formatRegionLabel(region: { stateCode: string; stateName: string; cityName: string | null }): string {
  return region.cityName ? `${region.cityName}, ${region.stateCode}` : formatStateLabelByCode(region.stateCode);
}

/**
 * 首页（Meet5 风格改版，02-home-page.md，08 号卡修订了顶部地区入口的
 * 具体样式）。
 *
 * 顶部栏换成 TopBar 的 home 变体（01 号卡产出），不再是旧版"← Saminest
 * 发布"那一整行——发布入口从文字按钮变成顶部"＋"图标（点击复用已有的
 * PublishActionSheet，这个组件之前由 app-header.tsx 触发，现在首页自己
 * 接管；app-header.tsx 本身不用动，它还在为其它没迁移的页面服务，见
 * app-shell.tsx 的路由级开关）。首页不再渲染底部悬浮发布按钮——发布入口
 * 已经统一收到顶部"＋"图标，不需要 Fab 组件。
 *
 * 搜索从"页面顶部一整行常驻输入框"改成"点🔍图标切换显隐"：搜索本身的
 * 防抖/查询逻辑完全没变（还是这同一个 inputValue/debouncedSearchQuery/
 * PostList 组合），只是外面包了一层"要不要显示这个输入框"的开关——按
 * 任务卡"可先用现有搜索逻辑"的要求，不重新实现一套。关闭搜索时顺带清空
 * 已输入的内容，回到浏览模式（分类 Chips + 完整信息流），不留一个隐藏起来
 * 但仍在生效的过滤条件。
 *
 * 分类筛选（03-category-tab.md）：读取 `?category=<slug>` 这个 URL 查询
 * 参数决定当前筛选态——分类 Tab 页（categories-page.tsx）的三个 tile 和
 * 这个页面自己的 CategoryNav 分类 Chips 现在都统一导航到
 * `/?category=<slug>`（见 category-nav.tsx 的改动），不再各自指向一个
 * 独立的 `/category/:slug` 详情页；那个页面已经退役（复用同一个 PostList
 * 组件渲染筛选后的列表，不需要单独再做一套列表 UI，见任务卡原话）。
 * 用 URL 而不是本地 state 存这个筛选态，是为了让分类 Tab 页的 tile 链接、
 * 浏览器前进/后退、直接分享/收藏某个分类筛选态的链接都自然工作，不需要
 * 额外的状态同步逻辑。
 *
 * 08 号卡（地区选择扩展全美 + 按州筛选）：
 * - 顶部胶囊按钮从"只显示州代码的单行文字"改成两行堆叠，第二行文案见
 *   formatRegionLabel；onStateClick 改名 onRegionClick，语义从"点州名"
 *   变成"点整个胶囊"，见 top-bar.tsx 对应 prop 的注释。
 * - selectedRegion.stateCode 现在真正喂给 PostList 做服务端过滤（透传到
 *   listApprovedPosts 的 stateCode 参数），不再只是首页胶囊按钮的展示
 *   文本——四个分类 tab 复用的都是同一个 PostList，筛选逻辑天然对四个
 *   tab 一致生效，不需要各自实现一遍。
 * - PostList 的"这个地区还没有内容"空状态需要一个"去发布"入口，直接复用
 *   这个页面已有的 publishSheetOpen/PublishActionSheet（顶部"＋"图标同一套
 *   开关），不是另起一个入口。
 */
export function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [publishSheetOpen, setPublishSheetOpen] = useState(false);
  const debouncedSearchQuery = useDebouncedValue(inputValue, SEARCH_DEBOUNCE_MS);
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);

  const { data: categories } = useCategoriesQuery();
  const activeCategorySlug = searchParams.get("category") ?? undefined;
  const activeCategoryId = categories?.find(
    (category) => category.slug === activeCategorySlug
  )?.id;

  function handleToggleSearch(): void {
    setIsSearchOpen((current) => {
      const next = !current;
      if (!next) {
        setInputValue("");
      }
      return next;
    });
  }

  return (
    <main data-testid="home-page">
      <TopBar
        variant="home"
        regionLabel={selectedRegion ? formatRegionLabel(selectedRegion) : null}
        onRegionClick={() => navigate(REGION_SELECT_PATH)}
        onCreateClick={() => setPublishSheetOpen(true)}
        onSearchClick={handleToggleSearch}
      />

      {isSearchOpen ? (
        <div className="px-4 pb-2">
          <input
            type="search"
            autoFocus
            placeholder="搜租房、求租、二手物品…"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            className="h-13 w-full rounded-search border border-border bg-card px-4 text-base text-text shadow-search"
          />
        </div>
      ) : null}

      <CategoryNav activeSlug={activeCategorySlug} />
      <PostList
        key={activeCategoryId ?? "all"}
        categoryId={activeCategoryId}
        searchQuery={debouncedSearchQuery}
        stateCode={selectedRegion?.stateCode}
        onPublishClick={() => setPublishSheetOpen(true)}
      />

      {publishSheetOpen ? (
        <PublishActionSheet onClose={() => setPublishSheetOpen(false)} />
      ) : null}
    </main>
  );
}

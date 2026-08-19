import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PublishActionSheet } from "../../components/publish-action-sheet";
import { TopBar } from "../../components/top-bar";
import { CategoryNav } from "../../features/categories/category-nav";
import { useCategoriesQuery } from "../../features/categories/use-categories-query";
import { PostList } from "../../features/posts/post-list";
import { useDebouncedValue } from "../../utils/use-debounced-value";

const SEARCH_DEBOUNCE_MS = 400;

/**
 * 06 号卡（地区选择）还没落地——项目里目前没有任何"用户当前选中的州"这个
 * 概念的数据源/持久化机制（跟活动筛选用的 useActivityRegionsQuery 是完全
 * 独立的两件事，那个是"找搭子"列表筛选用的，不是首页顶部这个"我当前在
 * 哪个州"的用户级选择）。这里先用 null 占位——TopBar 的 home 变体
 * stateName 为 null 时只显示"Saminest"，不会有孤零零的"· "分隔符，也不会
 * 渲染可点击的州名按钮，见 top-bar.tsx。06 号卡把真正的"选中地区"数据源
 * 建出来之后，这里换成读那个数据源即可，不需要改 TopBar 本身。
 */
const PLACEHOLDER_STATE_NAME: string | null = null;

/**
 * 06 号卡还没建"地区选择"页面对应的路由——这里先接入一个占位路径（跟
 * 任务卡"点🔍先接入路由即可"是同一个处理方式）：目前 routes.tsx 里没有
 * 匹配这个路径的路由，点击会落到全局的通配符 NotFoundPage，不是死链接/
 * 报错，06 号卡建好页面后这个路径会命中真正的路由，这里不需要再改。
 */
const REGION_SELECT_PATH = "/region-select";

/**
 * 首页（Meet5 风格改版，02-home-page.md）。
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
 */
export function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [publishSheetOpen, setPublishSheetOpen] = useState(false);
  const debouncedSearchQuery = useDebouncedValue(inputValue, SEARCH_DEBOUNCE_MS);

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
        stateName={PLACEHOLDER_STATE_NAME}
        onStateClick={() => navigate(REGION_SELECT_PATH)}
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
      />

      {publishSheetOpen ? (
        <PublishActionSheet onClose={() => setPublishSheetOpen(false)} />
      ) : null}
    </main>
  );
}

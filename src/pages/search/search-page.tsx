import { useState } from "react";

import { FilterChips } from "../../components/filter-chips";
import { TopBar } from "../../components/top-bar";
import { formatShortRegionLabel } from "../../data/us-states";
import { CategoriesGate } from "../../features/categories/categories-gate";
import { FREE_CATEGORY_SLUG } from "../../features/posts/free-items";
import { HIRING_CATEGORY_SLUG, JOB_SEEKING_CATEGORY_SLUG } from "../../features/posts/job-fields";
import { PostList } from "../../features/posts/post-list";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { useDebouncedValue } from "../../utils/use-debounced-value";
import { INLINE_SEARCH_DEBOUNCE_MS } from "../../utils/use-inline-search";

type SearchScope = "all" | "jobs" | "housing" | "used" | "free";

const SCOPE_SLUGS: Record<Exclude<SearchScope, "all">, string[]> = {
  jobs: [HIRING_CATEGORY_SLUG, JOB_SEEKING_CATEGORY_SLUG],
  housing: ["rent", "wanted"],
  used: ["used"],
  free: [FREE_CATEGORY_SLUG]
};

const SCOPE_OPTIONS: Array<{ key: SearchScope; label: string }> = [
  { key: "all", label: "全部" },
  { key: "jobs", label: "招聘求职" },
  { key: "housing", label: "房屋租售" },
  { key: "used", label: "二手闲置" },
  { key: "free", label: "免费物品" }
];

/**
 * 全站搜索页（/search，公开）——首页顶栏的搜索按钮进入。
 *
 * 分类页顶栏统一任务卡：原来这个页面只搜社区和社区帖子（社区功能那时候写
 * 的），首页点搜索搜"书桌"之类的东西永远搜不到。改成搜分类信息的帖子：
 * 招聘求职 / 房屋租售 / 二手闲置 / 免费物品，按标题和正文匹配，按当前选中
 * 的州筛选；上面一排小筛选可以缩小到某一类。社区和社区帖子的搜索还在社区页
 * 自己的搜索框里（community-browse-page.tsx / community-feed-page.tsx）。
 *
 * 列表直接复用 PostList（它本来就支持关键词 + 多个分类 + 州）；招聘求职用
 * 工作帖的文字行，其它用图片网格。
 */
export function SearchPage() {
  const [searchText, setSearchText] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const keyword = useDebouncedValue(searchText, INLINE_SEARCH_DEBOUNCE_MS).trim();
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);
  const stateCode = selectedRegion?.stateCode;
  const regionLabel = selectedRegion ? formatShortRegionLabel(selectedRegion) : null;

  const slugs = scope === "all" ? Object.values(SCOPE_SLUGS).flat() : SCOPE_SLUGS[scope];

  return (
    <main data-testid="search-page" className="pb-24 md:pb-6">
      <TopBar variant="nav-only" title="搜索" />
      <div className="px-4 pt-3">
        <input
          type="search"
          autoFocus
          aria-label="搜索帖子"
          placeholder={regionLabel ? `在${regionLabel}搜索工作、房屋、二手…` : "搜索工作、房屋、二手…"}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          className="h-11 w-full rounded-search border border-border bg-card px-4 text-base text-text focus:border-primary focus:outline-none"
        />
      </div>
      <FilterChips label="搜索范围" options={SCOPE_OPTIONS} value={scope} onChange={setScope} />

      {keyword ? (
        <CategoriesGate>
          {(idBySlug) => {
            const categoryIds = slugs
              .map((slug) => idBySlug.get(slug))
              .filter((id): id is string => Boolean(id));
            // 分类还没建好时不能不带分类条件去查（会把所有帖子都查出来）。
            if (categoryIds.length === 0) {
              return (
                <p role="status" className="px-4 py-6 text-sm text-text-muted">
                  没有找到相关帖子。
                </p>
              );
            }
            return (
              <PostList
                key={scope}
                variant={scope === "jobs" ? "job" : "grid"}
                categoryIds={categoryIds}
                stateCode={stateCode}
                searchQuery={keyword}
              />
            );
          }}
        </CategoriesGate>
      ) : (
        <p className="mt-10 px-4 text-center text-sm text-text-muted">输入关键词，搜索招聘、房屋、二手和免费物品</p>
      )}
    </main>
  );
}

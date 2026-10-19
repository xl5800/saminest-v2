import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { FilterChips } from "../../components/filter-chips";
import { CategoryTopBar } from "../../components/category-top-bar";
import { PostList } from "../../features/posts/post-list";
import { buildPublishPath } from "../../features/posts/publish-path";
import { useInlineSearch } from "../../utils/use-inline-search";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { CategoriesGate, NoPostsYet } from "../../features/categories/categories-gate";

type HousingFilter = "rent" | "wanted";

const HOUSING_FILTERS: Array<{ key: HousingFilter; label: string }> = [
  { key: "rent", label: "出租" },
  { key: "wanted", label: "求租" }
];

/**
 * 房屋租售页（/housing，公开）——首页图标入口改版：原来是首页的第二个标签。
 * 出租用图片网格，求租用文字卡片（两种格式不能混在一起），按当前选中的州
 * 筛选。右上角"＋"按当前筛选发出租或求租。
 *
 * 分类页顶栏统一任务卡：顶栏换成跟首页一样的"地区 + 搜索 + ＋"，左边加返回。
 * 搜索只搜当前的出租 / 求租，"＋"进发布页后只能选出租或求租。
 */
export function HousingPage() {
  const navigate = useNavigate();
  const stateCode = useSelectedRegionStore((s) => s.selectedRegion?.stateCode);
  const [filter, setFilter] = useState<HousingFilter>("rent");
  const publishPath = buildPublishPath(filter, HOUSING_FILTERS.map((option) => option.key));
  const search = useInlineSearch();

  return (
    <main data-testid="housing-page" className="pb-24 md:pb-6">
      <CategoryTopBar search={search} searchPlaceholder="搜索房屋租售" onCreateClick={() => navigate(publishPath)} />
      <FilterChips label="房屋租售筛选" options={HOUSING_FILTERS} value={filter} onChange={setFilter} />
      <CategoriesGate>
        {(idBySlug) => {
          const categoryId = idBySlug.get(filter);
          if (!categoryId) return <NoPostsYet />;
          return (
            <PostList
              key={filter}
              variant={filter === "wanted" ? "wanted" : "grid"}
              categoryId={categoryId}
              stateCode={stateCode}
              searchQuery={search.query}
              onPublishClick={() => navigate(publishPath)}
            />
          );
        }}
      </CategoriesGate>
    </main>
  );
}

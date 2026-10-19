import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { FilterChips } from "../../components/filter-chips";
import { TopBar } from "../../components/top-bar";
import { PostList } from "../../features/posts/post-list";
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
 */
export function HousingPage() {
  const navigate = useNavigate();
  const stateCode = useSelectedRegionStore((s) => s.selectedRegion?.stateCode);
  const [filter, setFilter] = useState<HousingFilter>("rent");

  return (
    <main data-testid="housing-page" className="pb-24 md:pb-6">
      <TopBar
        variant="nav-only"
        title="房屋租售"
        right={{
          icon: <Plus size={20} aria-hidden="true" />,
          label: "发布",
          onClick: () => navigate(`/publish?category=${filter}`)
        }}
      />
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
              onPublishClick={() => navigate(`/publish?category=${filter}`)}
            />
          );
        }}
      </CategoriesGate>
    </main>
  );
}

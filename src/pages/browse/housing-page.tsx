import { MapPin, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { FilterChips } from "../../components/filter-chips";
import { CategoryTopBar } from "../../components/category-top-bar";
import { NearbyLocationSheet } from "../../features/nearby/nearby-location-sheet";
import { NearbyPostList } from "../../features/nearby/nearby-post-list";
import { PostList } from "../../features/posts/post-list";
import { buildPublishPath } from "../../features/posts/publish-path";
import { useInlineSearch } from "../../utils/use-inline-search";
import { useNearbyLocationStore } from "../../store/nearby-location-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { CategoriesGate, NoPostsYet } from "../../features/categories/categories-gate";

type HousingFilter = "rent" | "wanted";

const HOUSING_FILTERS: Array<{ key: HousingFilter; label: string }> = [
  { key: "rent", label: "出租" },
  { key: "wanted", label: "求租" }
];

const EMPTY_NEARBY_TEXT: Record<HousingFilter, string> = {
  rent: "附近还没有出租房源，欢迎发布第一条",
  wanted: "附近还没有求租信息，欢迎发布第一条"
};

/**
 * 房屋租售页（/housing，公开）——首页图标入口改版：原来是首页的第二个标签。
 * 出租用图片网格，求租用文字卡片（两种格式不能混在一起），按当前选中的州
 * 筛选。右上角"＋"按当前筛选发出租或求租。
 *
 * 分类页顶栏统一任务卡：顶栏换成跟首页一样的"地区 + 搜索 + ＋"，左边加返回。
 * 搜索只搜当前的出租 / 求租，"＋"进发布页后只能选出租或求租。
 *
 * 距离筛选：出租 / 求租那一行最右边一个"距离"按钮，点开选位置（输入公司 /
 * 学校邮编，或用现在的位置）和范围。选了位置之后：
 * - 不再按州筛选（DMV 跨三个州，按距离更合理），范围内按发布时间从新到旧，
 *   超出范围的接在后面，没填邮编的最后；卡片上显示距离。
 * - 按钮变成"📍 地名 · 10mi ✕"，点文字改位置 / 范围，点 ✕ 取消回到按州显示。
 * 位置只存在这台手机上（跟首页"附近的二手"共用同一个位置）。
 */
export function HousingPage() {
  const navigate = useNavigate();
  const stateCode = useSelectedRegionStore((s) => s.selectedRegion?.stateCode);
  const location = useNearbyLocationStore((s) => s.location);
  const radiusMiles = useNearbyLocationStore((s) => s.radiusMiles);
  const clearLocation = useNearbyLocationStore((s) => s.clearLocation);
  const [filter, setFilter] = useState<HousingFilter>("rent");
  const [sheetOpen, setSheetOpen] = useState(false);
  const publishPath = buildPublishPath(filter, HOUSING_FILTERS.map((option) => option.key));
  const search = useInlineSearch();

  return (
    <main data-testid="housing-page" className="pb-24 md:pb-6">
      <CategoryTopBar search={search} searchPlaceholder="搜索房屋租售" onCreateClick={() => navigate(publishPath)} />
      <div className="flex items-center">
        <div className="min-w-0 flex-1">
          <FilterChips label="房屋租售筛选" options={HOUSING_FILTERS} value={filter} onChange={setFilter} />
        </div>
        <div className="shrink-0 pb-2 pr-4 pt-3">
          {location ? (
            <span className="flex h-8 max-w-[11rem] items-center rounded-full bg-primary-light text-sm text-primary">
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-label={`距离：${location.label} ${radiusMiles} 英里内，点击修改`}
                className="flex min-w-0 items-center gap-1 pl-3 pr-1 font-semibold"
              >
                <MapPin aria-hidden="true" size={14} className="shrink-0" />
                <span className="truncate">{location.label}</span>
                <span className="shrink-0">· {radiusMiles}mi</span>
              </button>
              <button
                type="button"
                onClick={clearLocation}
                aria-label="取消距离筛选"
                className="flex h-8 w-7 shrink-0 items-center justify-center"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex h-8 items-center gap-1 rounded-full bg-field px-3.5 text-sm whitespace-nowrap text-text-body"
            >
              <MapPin aria-hidden="true" size={14} className="shrink-0" />
              距离
            </button>
          )}
        </div>
      </div>
      {location ? (
        <NearbyPostList
          key={filter}
          location={location}
          radiusMiles={radiusMiles}
          categorySlugs={[filter]}
          variant={filter === "wanted" ? "wanted" : "grid"}
          newestFirstWithinRadius
          searchQuery={search.query}
          emptyText={EMPTY_NEARBY_TEXT[filter]}
          onPublishClick={() => navigate(publishPath)}
        />
      ) : (
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
      )}
      {sheetOpen ? (
        <NearbyLocationSheet
          onClose={() => setSheetOpen(false)}
          title="离哪里近？"
          zipPlaceholder="公司或学校邮编，如 22102"
          zipFirst
        />
      ) : null}
    </main>
  );
}

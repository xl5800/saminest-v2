import { useNavigate } from "react-router-dom";

import { CategoryTopBar } from "../../components/category-top-bar";
import { PostList } from "../../features/posts/post-list";
import { buildPublishPath } from "../../features/posts/publish-path";
import { useInlineSearch } from "../../utils/use-inline-search";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { CategoriesGate, NoPostsYet } from "../../features/categories/categories-gate";

const USED_CATEGORY_SLUG = "used";

/**
 * 二手闲置页（/used，公开）——首页图标入口改版：原来是首页的第三个标签。
 * 图片网格，按当前选中的州筛选，右上角"＋"直接发二手。
 *
 * 分类页顶栏统一任务卡：顶栏换成跟首页一样的"地区 + 搜索 + ＋"，左边加返回。
 * 搜索只搜二手，"＋"进发布页后直接是二手（不显示分类选项）。
 */
export function UsedPage() {
  const navigate = useNavigate();
  const stateCode = useSelectedRegionStore((s) => s.selectedRegion?.stateCode);
  const publishPath = buildPublishPath(USED_CATEGORY_SLUG, [USED_CATEGORY_SLUG]);
  const search = useInlineSearch();

  return (
    <main data-testid="used-page" className="pb-24 md:pb-6">
      <CategoryTopBar search={search} searchPlaceholder="搜索二手闲置" onCreateClick={() => navigate(publishPath)} />
      <div className="pt-2">
        <CategoriesGate>
          {(idBySlug) => {
            const categoryId = idBySlug.get(USED_CATEGORY_SLUG);
            if (!categoryId) return <NoPostsYet />;
            return (
              <PostList
                variant="grid"
                categoryId={categoryId}
                stateCode={stateCode}
                searchQuery={search.query}
                onPublishClick={() => navigate(publishPath)}
              />
            );
          }}
        </CategoriesGate>
      </div>
    </main>
  );
}

import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { PostList } from "../../features/posts/post-list";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { CategoriesGate, NoPostsYet } from "./categories-gate";

const USED_CATEGORY_SLUG = "used";

/**
 * 二手闲置页（/used，公开）——首页图标入口改版：原来是首页的第三个标签。
 * 图片网格，按当前选中的州筛选，右上角"＋"直接发二手。
 */
export function UsedPage() {
  const navigate = useNavigate();
  const stateCode = useSelectedRegionStore((s) => s.selectedRegion?.stateCode);

  return (
    <main data-testid="used-page" className="pb-24 md:pb-6">
      <TopBar
        variant="nav-only"
        title="二手闲置"
        right={{
          icon: <Plus size={20} aria-hidden="true" />,
          label: "发布",
          onClick: () => navigate(`/publish?category=${USED_CATEGORY_SLUG}`)
        }}
      />
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
                onPublishClick={() => navigate(`/publish?category=${USED_CATEGORY_SLUG}`)}
              />
            );
          }}
        </CategoriesGate>
      </div>
    </main>
  );
}

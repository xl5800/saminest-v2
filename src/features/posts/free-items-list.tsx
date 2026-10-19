import { useNavigate } from "react-router-dom";

import { CategoriesGate } from "../categories/categories-gate";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { FREE_CATEGORY_SLUG } from "./free-items";
import { PostList } from "./post-list";

/**
 * 免费物品任务卡：免费物品的图片网格 + "还没有免费物品"空状态，首页下方和
 * 免费物品页（/free）共用。按当前选中的州筛选。分类还没建好（迁移没跑）时
 * 直接显示空状态，不能不带分类条件去查。
 */
export function FreeItemsList() {
  const navigate = useNavigate();
  const stateCode = useSelectedRegionStore((s) => s.selectedRegion?.stateCode);

  const emptyState = (
    <div role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-base text-text-body">还没有免费物品，你有闲置想送人吗？</p>
      <button
        type="button"
        onClick={() => navigate(`/publish?category=${FREE_CATEGORY_SLUG}`)}
        className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
      >
        免费发布
      </button>
    </div>
  );

  return (
    <CategoriesGate>
      {(idBySlug) => {
        const categoryId = idBySlug.get(FREE_CATEGORY_SLUG);
        if (!categoryId) return emptyState;
        return <PostList variant="grid" categoryId={categoryId} stateCode={stateCode} emptyState={emptyState} />;
      }}
    </CategoriesGate>
  );
}

import { useNavigate } from "react-router-dom";

import { CategoryTopBar } from "../../components/category-top-bar";
import { FREE_CATEGORY_SLUG } from "../../features/posts/free-items";
import { FreeItemsList } from "../../features/posts/free-items-list";
import { buildPublishPath } from "../../features/posts/publish-path";
import { useInlineSearch } from "../../utils/use-inline-search";

/**
 * 免费物品页（/free，公开）——免费物品任务卡。首页"免费物品"图标和首页
 * 免费物品区的"更多"进到这里；图片网格，按当前选中的州筛选，右上角"＋"
 * 直接发免费送。
 *
 * 分类页顶栏统一任务卡：顶栏换成跟首页一样的"地区 + 搜索 + ＋"，左边加返回。
 * 搜索只搜免费物品，"＋"进发布页后直接是免费物品（不显示分类选项）。
 */
export function FreePage() {
  const navigate = useNavigate();
  const publishPath = buildPublishPath(FREE_CATEGORY_SLUG, [FREE_CATEGORY_SLUG]);
  const search = useInlineSearch();

  return (
    <main data-testid="free-page" className="pb-24 md:pb-6">
      <CategoryTopBar search={search} searchPlaceholder="搜索免费物品" onCreateClick={() => navigate(publishPath)} />
      <div className="pt-2">
        <FreeItemsList searchQuery={search.query} />
      </div>
    </main>
  );
}

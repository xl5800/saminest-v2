import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { FREE_CATEGORY_SLUG } from "../../features/posts/free-items";
import { FreeItemsList } from "../../features/posts/free-items-list";

/**
 * 免费物品页（/free，公开）——免费物品任务卡。首页"免费物品"图标和首页
 * 免费物品区的"更多"进到这里；图片网格，按当前选中的州筛选，右上角"＋"
 * 直接发免费送。
 */
export function FreePage() {
  const navigate = useNavigate();

  return (
    <main data-testid="free-page" className="pb-24 md:pb-6">
      <TopBar
        variant="nav-only"
        title="免费物品"
        right={{
          icon: <Plus size={20} aria-hidden="true" />,
          label: "发布",
          onClick: () => navigate(`/publish?category=${FREE_CATEGORY_SLUG}`)
        }}
      />
      <div className="pt-2">
        <FreeItemsList />
      </div>
    </main>
  );
}

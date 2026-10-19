import { useNavigate } from "react-router-dom";

import { formatShortRegionLabel } from "../data/us-states";
import { useSelectedRegionStore } from "../store/selected-region-store";
import type { InlineSearch } from "../utils/use-inline-search";
import { TopBar } from "./top-bar";

const REGION_SELECT_PATH = "/region-select";

/**
 * 分类页顶栏统一任务卡：招聘求职 / 房屋租售 / 二手闲置 / 免费物品 / 找搭子
 * 页共用的顶栏——"‹ 📍弗吉尼亚 ⌄ ……… 🔍 ＋"。地区跟首页是同一个
 * （useSelectedRegionStore + formatShortRegionLabel + /region-select）。
 * 点搜索在顶栏下面展开搜索框（跟顶栏在同一张固定卡片里），只搜当前页面的
 * 分类，提示文字写明范围；"＋"只发当前分类，由页面传 onCreateClick。
 */
export function CategoryTopBar({
  search,
  searchPlaceholder,
  onCreateClick
}: {
  search: InlineSearch;
  /** 比如"搜索二手闲置"。 */
  searchPlaceholder: string;
  onCreateClick: () => void;
}) {
  const navigate = useNavigate();
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);

  return (
    <TopBar
      variant="home"
      hideBrand
      showBack
      regionLabel={selectedRegion ? formatShortRegionLabel(selectedRegion) : null}
      onRegionClick={() => navigate(REGION_SELECT_PATH)}
      onSearchClick={search.toggle}
      onCreateClick={onCreateClick}
      bottomSlot={
        search.isOpen ? (
          <div className="px-4 pb-2">
            <input
              type="search"
              autoFocus
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={search.inputValue}
              onChange={(event) => search.setInputValue(event.target.value)}
              className="h-11 w-full rounded-search border border-border bg-card px-4 text-base text-text focus:border-primary focus:outline-none"
            />
          </div>
        ) : null
      }
    />
  );
}

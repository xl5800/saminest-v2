import { Briefcase, ChevronRight, Gift, Handshake, Home, type LucideIcon, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { hideSplashScreen } from "../../app/splash-screen";

import { TopBar } from "../../components/top-bar";
import { formatShortRegionLabel } from "../../data/us-states";
import { NearbyLocationBar } from "../../features/nearby/nearby-location-bar";
import { NearbyLocationSheet } from "../../features/nearby/nearby-location-sheet";
import { NearbyUsedList } from "../../features/nearby/nearby-used-list";
import { useSelectedRegionStore } from "../../store/selected-region-store";

const REGION_SELECT_PATH = "/region-select";
const SEARCH_PATH = "/search";

export const HOME_ENTRIES: Array<{ to: string; label: string; Icon: LucideIcon }> = [
  { to: "/jobs", label: "招聘求职", Icon: Briefcase },
  { to: "/housing", label: "房屋租售", Icon: Home },
  { to: "/used", label: "二手闲置", Icon: ShoppingBag },
  { to: "/free", label: "免费物品", Icon: Gift },
  { to: "/activities", label: "找搭子", Icon: Handshake }
];

/**
 * 首页（`/`）——首页图标入口改版：
 *
 * - 顶栏：左边📍地区（"弗吉尼亚 ⌄"，点了去 /region-select），右边搜索。
 * - 一排图标入口：招聘求职 · 房屋租售 · 二手闲置 · 找搭子，点了跳到各自的
 *   页面（/jobs、/housing、/used、/activities）。之前这四个是首页里切换的
 *   标签，列表内容原样搬到了 pages/browse/ 下的三个页面，找搭子用现有的
 *   找搭子页。
 * - 免费物品任务卡：图标行多了"免费物品"（第 4 个，在找搭子前面）；图标
 *   下面是免费物品信息流（图片网格，按当前州筛选），右上"更多"进 /free。
 *   免费东西人人都想看，打开 App 就有东西刷。
 * - 附近的二手任务卡：图标下面换成"附近的二手"（免费物品图标和 /free 页
 *   保留）。标题下面是位置条，点了打开选位置的弹层（用现在的位置 / 输入
 *   邮编 / 范围）；打开 App 时不主动请求定位。没设位置就按当前州显示二手。
 *
 * 发布入口在底部导航中间的"＋"。
 */
export function HomePage() {
  const navigate = useNavigate();
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);
  const regionLabel = selectedRegion ? formatShortRegionLabel(selectedRegion) : null;
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);

  // 首页没有要等的数据，挂载就收起启动图（hideSplashScreen 只有第一次生效）。
  useEffect(() => {
    hideSplashScreen();
  }, []);

  return (
    <main data-testid="home-page" className="pb-24 md:pb-6">
      <TopBar
        variant="home"
        hideBrand
        regionLabel={regionLabel}
        onRegionClick={() => navigate(REGION_SELECT_PATH)}
        onSearchClick={() => navigate(SEARCH_PATH)}
      />

      <nav aria-label="分类入口" className="grid grid-cols-5 gap-1 px-3 pt-3">
        {HOME_ENTRIES.map(({ to, label, Icon }) => (
          <Link key={to} to={to} className="flex flex-col items-center gap-1.5 rounded-2xl py-2 active:bg-surface-pressed">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-primary">
              <Icon aria-hidden="true" size={24} strokeWidth={2} />
            </span>
            <span className="whitespace-nowrap text-[13px] text-text">{label}</span>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="home-nearby-heading" className="mt-4">
        <div className="flex items-center justify-between px-4 pb-1">
          <h2 id="home-nearby-heading" className="text-lg font-bold text-text">
            附近的二手闲置
          </h2>
          <Link to="/used" className="flex items-center text-sm text-primary">
            更多
            <ChevronRight aria-hidden="true" size={16} />
          </Link>
        </div>
        <NearbyLocationBar regionLabel={regionLabel} onClick={() => setLocationSheetOpen(true)} />
        <div className="pt-2">
          <NearbyUsedList />
        </div>
      </section>
      {locationSheetOpen ? <NearbyLocationSheet onClose={() => setLocationSheetOpen(false)} /> : null}
    </main>
  );
}

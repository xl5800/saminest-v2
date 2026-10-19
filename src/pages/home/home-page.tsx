import { Briefcase, Handshake, Home, type LucideIcon, ShoppingBag } from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { hideSplashScreen } from "../../app/splash-screen";

import { TopBar } from "../../components/top-bar";
import { formatShortRegionLabel } from "../../data/us-states";
import { useSelectedRegionStore } from "../../store/selected-region-store";

const REGION_SELECT_PATH = "/region-select";
const SEARCH_PATH = "/search";

export const HOME_ENTRIES: Array<{ to: string; label: string; Icon: LucideIcon }> = [
  { to: "/jobs", label: "招聘求职", Icon: Briefcase },
  { to: "/housing", label: "房屋租售", Icon: Home },
  { to: "/used", label: "二手闲置", Icon: ShoppingBag },
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
 * - 图标下面暂时留空（BARRY 2026-10-18：先只放图标；以后放"免费物品"
 *   信息流，免费物品功能还没做）。
 *
 * 发布入口在底部导航中间的"＋"。
 */
export function HomePage() {
  const navigate = useNavigate();
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);

  // 首页没有要等的数据，挂载就收起启动图（hideSplashScreen 只有第一次生效）。
  useEffect(() => {
    hideSplashScreen();
  }, []);

  return (
    <main data-testid="home-page" className="pb-24 md:pb-6">
      <TopBar
        variant="home"
        hideBrand
        regionLabel={selectedRegion ? formatShortRegionLabel(selectedRegion) : null}
        onRegionClick={() => navigate(REGION_SELECT_PATH)}
        onSearchClick={() => navigate(SEARCH_PATH)}
      />

      <nav aria-label="分类入口" className="grid grid-cols-4 gap-2 px-4 pt-3">
        {HOME_ENTRIES.map(({ to, label, Icon }) => (
          <Link key={to} to={to} className="flex flex-col items-center gap-1.5 rounded-2xl py-2 active:bg-surface-pressed">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-primary">
              <Icon aria-hidden="true" size={24} strokeWidth={2} />
            </span>
            <span className="text-[13px] text-text">{label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}

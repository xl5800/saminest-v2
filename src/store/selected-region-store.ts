import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SelectedRegion {
  /** 选中的城市（locations 表 type = 'city' 的一行）id——地区选择页里
   *  真正被选中的永远是一个具体城市，即使是"单一地区的州"（如 DC）也是
   *  直接选中它唯一的那个城市，不存在"只选了州、没有具体城市"的中间态。 */
  cityId: string;
  /** 城市展示名，如 "Arlington" / "Washington, DC"——目前没有页面直接展示
   *  这个字段（首页顶部只显示 stateCode），保留下来是因为"选中的到底是
   *  哪个城市"本身是有意义的信息，以后如果要在别处展示具体城市（而不是
   *  只显示州），不需要再回头改这个 store 的形状。 */
  cityName: string;
  /** 城市所属的州代码（'DC' / 'VA' / 'MD'），首页 TopBar 的 stateName 就是
   *  读这个字段——见 top-bar.tsx 的 home 变体、home-page.tsx。 */
  stateCode: string;
}

interface SelectedRegionState {
  selectedRegion: SelectedRegion | null;
  setSelectedRegion: (region: SelectedRegion) => void;
}

/**
 * 06 号卡新增的数据源：「用户当前浏览的地区」（地区选择页选中后，首页顶部
 * 州名读这里）。
 *
 * 这是纯前端持久化状态，不是 profiles 表的字段——跟已确认的方案一致：
 * 1. 地区选择页从首页可以匿名访问（未登录游客也能刷首页/选地区），不能
 *    绑定到需要登录的 profiles 行。
 * 2. 这是"我现在想看哪个地区的内容"，跟 profiles.location_id（"我资料上
 *    填的所在地"，编辑资料页那个字段）是两个不同的概念，即使某个登录用户
 *    正好把两者填成一样的值也只是巧合，不应该共用同一份存储，否则以后
 *    这两个概念分道扬镳时会需要拆分一次数据迁移。
 * 3. 用 Zustand 管理（而不是 TanStack Query）符合 AI-Development.md 5.4
 *    的边界——这是纯客户端 UI 状态，不是服务端数据，没有对应的 Supabase
 *    表/RLS，不应该伪装成一次查询。
 *
 * persist 中间件把状态写进 localStorage，刷新页面/关闭浏览器再回来都还
 * 在，键名加 saminest 前缀避免跟其它 localStorage 使用者（如果以后有）
 * 冲突。初始值是 null——对应 TopBar home 变体 stateName 为 null 时的
 * "只显示 Saminest，不显示州名" 这条已有行为，游客/新用户在第一次手动选择
 * 地区之前，首页顶部就是这个样子，不需要一个默认地区兜底。
 */
export const useSelectedRegionStore = create<SelectedRegionState>()(
  persist(
    (set) => ({
      selectedRegion: null,
      setSelectedRegion: (region) => set({ selectedRegion: region })
    }),
    { name: "saminest-selected-region" }
  )
);

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SelectedRegion {
  /** 州代码，两字母缩写（如 "VA"/"CA"/"DC"）——08 号卡起，这是筛选内容
   *  （首页信息流/找搭子列表）唯一依赖的字段，不再要求一定有对应的具体
   *  城市，见下面 cityId/cityName 的注释。 */
  stateCode: string;
  /** 州的英文全名，如 "Virginia"——08 号卡新增。全美 50 州展开后，大多数
   *  州没有真实城市数据（见 cityId 注释），单靠 stateCode 缩写（"CA"）在
   *  首页胶囊按钮上不够友好，这里额外存一份人类可读的全名，展示层直接用，
   *  不用每次现查一遍 src/data/us-states.ts 反查名字。 */
  stateName: string;
  /** 选中的城市（locations 表 type = 'city' 的一行）id——只有该州在
   *  locations 表里有真实城市数据（目前是 DC/VA/MD）且用户点进去选了具体
   *  某个城市时才有值。08 号卡起改成可为 null：全美 50 州里的大多数州
   *  locations 表根本没有对应的城市行，用户在地区选择页直接点选整个州
   *  （没有下钻）时，压根不存在一个可以引用的城市 id，见
   *  region-select-page.tsx 的 selectState()。 */
  cityId: string | null;
  /** 城市展示名，如 "Arlington"——跟 cityId 同步为 null/非 null，理由同上。
   *  目前没有页面直接展示这个字段（首页胶囊按钮第二行优先用
   *  "{cityName}, {stateCode}"，没有城市时退回 stateName，见 top-bar.tsx
   *  home 变体的调用点 home-page.tsx），保留这个字段是因为"选中的到底是
   *  哪个城市"本身是有意义的信息，以后如果要在别处单独展示具体城市，不需要
   *  再回头改这个 store 的形状。 */
  cityName: string | null;
}

interface SelectedRegionState {
  selectedRegion: SelectedRegion | null;
  setSelectedRegion: (region: SelectedRegion) => void;
  /** 08 号卡新增：地区选择页顶部新增的「全美」选项专用——选中它意味着
   *  "清除已选地区，恢复展示全部内容"，这是 06 号卡没有覆盖的能力（06 号卡
   *  只有"选中某个具体地区"这一种写操作，没有"取消选择"）。单独建一个
   *  action 而不是要求调用方 setSelectedRegion(null)：后者要么把
   *  setSelectedRegion 的参数类型改成 SelectedRegion | null（所有调用点都
   *  要多判一次 null），要么允许调用方传一个假的"空 SelectedRegion"对象
   *  糊弄类型系统，两种都不如一个语义清晰、没有参数的专用 action 直接。 */
  clearSelectedRegion: () => void;
}

/**
 * 06 号卡新增的数据源：「用户当前浏览的地区」（地区选择页选中后，首页顶部
 * 胶囊按钮 + 找搭子列表都读这里，见 08 号卡对首页/找搭子的筛选改动）。
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
 * 冲突。初始值是 null——对应 TopBar home 变体在没有选中地区时"只显示占位
 * 文案「选择地区」"这条已有行为，游客/新用户在第一次手动选择地区之前，
 * 首页顶部就是这个样子，不需要一个默认地区兜底；这也是 08 号卡"全美"选项
 * 选中后要恢复到的同一个状态，见 clearSelectedRegion。
 */
export const useSelectedRegionStore = create<SelectedRegionState>()(
  persist(
    (set) => ({
      selectedRegion: null,
      setSelectedRegion: (region) => set({ selectedRegion: region }),
      clearSelectedRegion: () => set({ selectedRegion: null })
    }),
    { name: "saminest-selected-region" }
  )
);

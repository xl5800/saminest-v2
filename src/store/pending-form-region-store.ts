import { create } from "zustand";

export interface PendingFormRegion {
  /** 州代码，两字母缩写——跟 SelectedRegion.stateCode 是同一套取值。 */
  stateCode: string;
  /** 州的英文全名——保留跟 SelectedRegion 一致的形状，方便复用同一批
   *  selectState()/selectCity() 逻辑；展示层统一用 stateCode 反查
   *  formatStateLabelByCode() 拼中文格式，不直接展示这个英文名。 */
  stateName: string;
  cityId: string | null;
  cityName: string | null;
}

interface PendingFormRegionState {
  pendingRegion: PendingFormRegion | null;
  setPendingRegion: (region: PendingFormRegion) => void;
  clearPendingRegion: () => void;
}

/**
 * 12 号卡「地区选择格式统一 + 全局复用 /region-select」：发起搭子/发布
 * 租房/求租/二手这几个表单的"地区"字段，现在跳转复用同一个 /region-select
 * 整页组件选地区，不再各自维护原生下拉——这个 store 是"选完带着结果返回
 * 表单页并回填"这套导航机制的载体。
 *
 * 复用的是 08 号卡"全美"选项已经验证过的同一套形状（写一个 Zustand
 * store → RegionSelectPage 选中后 navigate(-1) 返回上一页 → 上一页已经
 * 订阅这个 store，拿到新值自动重渲染），不是另起一套"路由 state 传参 /
 * 回调函数"的机制——但特意不复用 useSelectedRegionStore 本身，因为"我现在
 * 想浏览哪个地区"（全局、持久化、首页/找搭子筛选在读）和"我这次在表单里
 * 选了哪个地区"（一次性、不持久化、被对应表单读一次就该清空）是两个不同
 * 生命周期的概念，混用同一个 store 会导致表单选完之后首页/找搭子的筛选
 * 结果也跟着变、或者表单里显示上次浏览时选的地区这类互相污染的问题。
 *
 * 不用 persist 中间件——这只是页面间的一次性交接数据，不需要在刷新页面/
 * 关闭浏览器后还留着；表单页消费后会立刻调用 clearPendingRegion()，避免
 * 残留的旧值在下一次进入另一个表单时被误读。
 */
export const usePendingFormRegionStore = create<PendingFormRegionState>((set) => ({
  pendingRegion: null,
  setPendingRegion: (region) => set({ pendingRegion: region }),
  clearPendingRegion: () => set({ pendingRegion: null })
}));

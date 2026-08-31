import { create } from "zustand";

export interface PendingActivityFormDraft {
  channel: string;
  tagText: string;
  title: string;
  description: string;
  isOnline: boolean;
  landmarkText: string;
  startAt: string;
  capacity: string;
  contactMethod: string;
  contactValue: string;
  requiresApproval: boolean;
}

/** 草稿在 store 里实际存的形状——比对外暴露的 PendingActivityFormDraft
 *  多一个写入时刻，只在这个文件内部用于时效判断，不对外暴露（见下面
 *  getFreshDraft 的说明）。 */
type StoredActivityFormDraft = PendingActivityFormDraft & { savedAt: number };

/** 草稿最长有效期：正常情况下"点选择州 → 在 /region-select 选完 → 返回"
 *  就是几秒钟的事，5 分钟已经比这宽裕很多，够覆盖用户中途被打断、切出去
 *  接个电话再回来这种情况；同时又足够短，真出现下面这种情况时不会造成
 *  太离谱的后果——用户点开"选择州"之后，没有走完整个来回，而是从
 *  /region-select 那个页面（跟这个表单不是同一套沉浸式路由，还带着底部
 *  Tab 栏，见 app-shell.tsx 的 TOPBAR_MIGRATED_PATTERNS）直接点了其它
 *  Tab 跳去了别的地方——这种情况下这份草稿会一直留在这个内存 store 里，
 *  直到用户之后随便什么时候（可能是几小时甚至几天后）又打开同一个发布
 *  页面，才会被当成"新草稿"误回填进去。这个时效上限就是专门给这种半途
 *  而废的路径兜底的，把"万一没兜住会有多糟"限制在一个短窗口内，而不是
 *  真的去改造 region-select-page.tsx 或者引入更复杂的机制来彻底堵死这个
 *  路径——具体取舍见 27 号卡完工报告。 */
const MAX_DRAFT_AGE_MS = 5 * 60 * 1000;

interface PendingActivityFormDraftState {
  draft: StoredActivityFormDraft | null;
  saveDraft: (draft: PendingActivityFormDraft) => void;
  clearDraft: () => void;
  /** 读取草稿时顺带做时效检查——超过 MAX_DRAFT_AGE_MS 就当没有草稿处理
   *  （返回 null，不回填），不管草稿本身内容是什么。纯粹的计算型读取，
   *  不会顺带清空 store——清空仍然是调用方在挂载后单独调用 clearDraft()
   *  做的事，读和清两件事分开，跟这个 store 原来的用法保持一致。 */
  getFreshDraft: () => PendingActivityFormDraft | null;
}

/**
 * 27 号卡（发布表单——选择"州"清空已输入内容的 bug）：
 *
 * 根因：create-activity-page.tsx"选择州"字段点击后会 navigate() 跳转到
 * /region-select 整页选择（12 号卡起的既有导航方式）——但 /region-select
 * 是一个独立路由，跳过去这一下会让 CreateActivityPage 整个卸载，选完地区
 * 从 /region-select 那边 navigate(-1) 回来时，创建的是全新的组件实例，
 * 所有 useState 都从初始值重新开始。地区字段（locationId/regionLabel）
 * 之所以能在这次跳转里"全须全尾"地回填，是因为它专门有
 * pending-form-region-store.ts 这个页面外部的 store 在接住选择结果，
 * 跟组件是不是被卸载重挂载完全无关；除了地区字段之外的其它字段（细分
 * 标签/标题/说明/地标/开始时间/人数上限/联系方式/报名审核开关）没有任何
 * 东西在页面外面接住，卸载重挂载时全部打回默认空值——这才是用户"选个州
 * 就把半天填的内容清空了"的真正原因，不是某个字段 value 绑定错误依赖了
 * 州，也不是有什么 key 在跟着州变化触发重新挂载。
 *
 * 修复思路完全照抄地区字段本来就在用的模式：点击"选择州"跳转之前，先把
 * 当前表单里（地区以外）其它字段的值整个存进这个页面外部的 store；组件
 * 重新挂载时读一次这个 store 的快照，当作各个 useState 的初始值，然后
 * 清空 store，避免下次全新进入这个页面（比如发布完一次、之后再发布另一
 * 条）时还读到上一次的旧草稿。
 *
 * 不用 persist 中间件——跟 pending-form-region-store.ts 是同一个理由，这
 * 只是同一次导航往返之间的临时交接数据，不需要在刷新页面/关闭浏览器后
 * 还留着。
 */
export const usePendingActivityFormDraftStore = create<PendingActivityFormDraftState>(
  (set, get) => ({
    draft: null,
    saveDraft: (draft) => set({ draft: { ...draft, savedAt: Date.now() } }),
    clearDraft: () => set({ draft: null }),
    getFreshDraft: () => {
      const { draft } = get();
      if (!draft) return null;
      if (Date.now() - draft.savedAt > MAX_DRAFT_AGE_MS) return null;

      const { savedAt: _savedAt, ...rest } = draft;
      return rest;
    }
  })
);

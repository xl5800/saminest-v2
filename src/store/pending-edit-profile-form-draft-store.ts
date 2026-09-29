import { create } from "zustand";

export interface PendingEditProfileFormDraft {
  displayName: string;
  bio: string;
  /** "找搭子详情页改版对齐方案图"任务卡 1 新增的年龄字段——表单原始字符串，
   *  跟 displayName/bio 是同一个约定，一起参与下面的 round-trip。 */
  age: string;
}

type StoredEditProfileFormDraft = PendingEditProfileFormDraft & { savedAt: number };

/** 草稿最长有效期——跟 pending-post-form-draft-store.ts /
 *  pending-activity-form-draft-store.ts 的 MAX_DRAFT_AGE_MS 是完全同一个
 *  理由、同一个取值（5 分钟），三个 store 字段集合不一样所以各自独立
 *  定义，不是共用同一个常量，但值本身要保持一致。 */
const MAX_DRAFT_AGE_MS = 5 * 60 * 1000;

interface PendingEditProfileFormDraftState {
  draft: StoredEditProfileFormDraft | null;
  saveDraft: (draft: PendingEditProfileFormDraft) => void;
  clearDraft: () => void;
  getFreshDraft: () => PendingEditProfileFormDraft | null;
}

/**
 * design_handoff_saminest_ios 第 6 项 gap #3（README「编辑资料『常驻地区』
 * 同样改为州选择」）：edit-profile-page.tsx 的"常驻地区"字段从原生
 * <select>（只能选 14 个 DC/VA/MD 城市）改成跳转 /region-select?mode=form
 * 整页选择全美 51 州，跟 publish-page.tsx / create-activity-page.tsx 是
 * 同一套 27 号卡问题、同一套修复模式：这次导航会让 EditProfilePage 真的
 * 卸载重挂载，昵称/简介/年龄这三个字段如果用户已经改过、还没点"保存"，
 * 会被组件重新挂载后从 useMyProfileQuery 拉到的服务端原始值悄悄冲掉——
 * 跳转前把这三个字段存进这个页面外部的 store，重新挂载后读一次当初始值，
 * 再清空，跟 pending-post-form-draft-store.ts 顶部注释是同一套论证，这里
 * 不重复一遍。
 *
 * locationId/regionLabel（地区本身）不需要存进这个草稿——回来之后靠
 * usePendingFormRegionStore 那个一次性 store 直接回填，见
 * edit-profile-page.tsx 消费 pendingRegion 的 effect，跟其它两个表单是
 * 同一个道理。avatarFile 同样不需要存：换头像是"选中即上传即生效"的独立
 * 子流程（见 edit-profile-page.tsx 顶部注释），不依赖这次导航前后的表单
 * 状态。
 *
 * 不用 persist 中间件——跟另外两个表单草稿 store 是同一个理由，纯内存
 * 一次性交接，不需要留一份在 localStorage 里。
 */
export const usePendingEditProfileFormDraftStore = create<PendingEditProfileFormDraftState>(
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

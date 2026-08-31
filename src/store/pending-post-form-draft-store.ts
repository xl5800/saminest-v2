import { create } from "zustand";

import type { PostDetailImage } from "../repositories/posts-repository";

export interface PendingPostFormDraft {
  categoryId: string;
  title: string;
  description: string;
  price: string;
  contactMethod: string;
  contactValue: string;
  images: File[];
  /** 编辑模式下已经上传的图片——一并存进草稿，是为了在恢复草稿时能整个
   *  跳过 publish-page.tsx 那个"从 existingPost 回填表单"的 effect（见该
   *  文件 seededRef 的用法），不然那个 effect 会在组件重新挂载后用服务端
   *  数据把刚恢复回来的草稿覆盖掉。这几张图片本来就是导航离开前已经从
   *  服务端查到、正常展示着的，原样存一份不会比重新查一次更"不新鲜"。 */
  existingImages: PostDetailImage[];
}

/** 草稿在 store 里实际存的形状——比对外暴露的 PendingPostFormDraft 多一个
 *  写入时刻，只在这个文件内部用于时效判断，不对外暴露（见下面
 *  getFreshDraft 的说明）。 */
type StoredPostFormDraft = PendingPostFormDraft & { savedAt: number };

/** 草稿最长有效期——跟 pending-activity-form-draft-store.ts 的
 *  MAX_DRAFT_AGE_MS 是完全同一个理由、同一个取值（5 分钟），两个 store
 *  字段集合不一样所以各自独立定义，不是共用同一个常量，但值本身要保持
 *  一致。详细取舍见那份文件顶部的注释和 27 号卡完工报告。 */
const MAX_DRAFT_AGE_MS = 5 * 60 * 1000;

interface PendingPostFormDraftState {
  draft: StoredPostFormDraft | null;
  saveDraft: (draft: PendingPostFormDraft) => void;
  clearDraft: () => void;
  /** 读取草稿时顺带做时效检查——超过 MAX_DRAFT_AGE_MS 就当没有草稿处理
   *  （返回 null，不回填）。纯粹的计算型读取，不会顺带清空 store——清空
   *  仍然是调用方在挂载后单独调用 clearDraft() 做的事。 */
  getFreshDraft: () => PendingPostFormDraft | null;
}

/**
 * 27 号卡（发布表单——选择"州"清空已输入内容的 bug）：
 *
 * publish-page.tsx（租房/求租/二手三个发布入口共用同一个组件，见该文件
 * 顶部注释）的"地区"字段点击后同样 navigate() 跳转到 /region-select 整页
 * 选择，是 create-activity-page.tsx 那个 bug 的同一个根因——见
 * pending-activity-form-draft-store.ts 顶部注释更详细的原因说明，这里不
 * 重复一遍，只是同一套修复思路（导航前把其它字段存进这个页面外部的
 * store、重新挂载后读一次当初始值、再清空）搬到帖子表单这边，字段集合
 * 不一样（多了图片、少了"线上活动"/报名审核这些活动专属字段），所以是
 * 单独一个 store，不是把两种表单的草稿塞进同一个 store 里。
 *
 * 新建和编辑（/publish、/publish/:id）都会用到——编辑模式下如果用户在
 * "从服务端回填表单"之后又做了修改、这时候去点了"选择地区"，同样会因为
 * 组件被卸载重挂载而丢失这些修改（不是打回空白，是被重新拉回服务端原始
 * 值，属于同一类"选个州就把刚改的内容冲掉"的问题），所以草稿恢复逻辑对
 * 新建/编辑两种模式一视同仁，不只覆盖新建这一种情况。
 *
 * 不用 persist 中间件——跟 pending-form-region-store.ts 是同一个理由，
 * 而且 images 是 File 对象，本来就没法被 JSON 序列化进 localStorage，
 * 这个 store 只能是纯内存的。
 */
export const usePendingPostFormDraftStore = create<PendingPostFormDraftState>((set, get) => ({
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
}));

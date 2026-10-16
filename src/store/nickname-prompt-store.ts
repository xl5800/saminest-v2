import { create } from "zustand";

/**
 * 首次报名/发私信时"给自己起个名字"弹窗的开关（注册登录简化任务卡）。
 *
 * 弹窗本身（components/nickname-prompt-sheet.tsx）挂在 AppShell 上，全站
 * 只有一个；触发方（报名按钮、联系卖家、私信、聊天发送）通过
 * use-nickname-prompt.ts 的 runWithNicknameCheck 调 request()，拿到一个
 * Promise，用户保存或跳过之后 resolve，触发方再继续原来的操作。
 */
interface NicknamePromptState {
  open: boolean;
  resolvers: Array<() => void>;
  request: () => Promise<void>;
  finish: () => void;
}

export const useNicknamePromptStore = create<NicknamePromptState>((set, get) => ({
  open: false,
  resolvers: [],
  request: () =>
    new Promise<void>((resolve) => {
      set({ open: true, resolvers: [...get().resolvers, resolve] });
    }),
  finish: () => {
    const { resolvers } = get();
    set({ open: false, resolvers: [] });
    for (const resolve of resolvers) resolve();
  }
}));

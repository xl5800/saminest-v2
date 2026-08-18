import { Plus } from "lucide-react";

export interface FabProps {
  label: string;
  /** default（Primary Blue）用于全站通用"发布"入口；dark（Blue Dark）是
   *  "找搭子"页专属，跟默认场景区分开，不引入新色相——见
   *  01-design-tokens-nav.md。不传就是 default。 */
  variant?: "default" | "dark";
  onClick: () => void;
  disabled?: boolean;
}

/**
 * 全站唯一的悬浮胶囊发布按钮组件——Meet5 风格改版任务卡 01 产出，目前还
 * 没有任何页面渲染它（首页改版后不用它，找搭子页会在 04 号卡接入，见
 * 00-overview.md 的执行顺序）。这里只交付组件本身。
 *
 * 固定在屏幕底部水平居中、悬浮于内容之上——bottom 偏移量用
 * `calc(4.5rem + env(safe-area-inset-bottom))`：4.5rem（72px）是"底部
 * Tab 栏大致高度（约 56-60px）+ 设计稿要求的 12-16px 间隙"的估算值，
 * env(...) 部分单独叠加，不重复计算——BottomNav 自己已经把安全区内边距
 * 加进了它自己的高度（见 bottom-nav.tsx 的 pb-[calc(...)]），FAB 是另一个
 * 独立的 fixed 元素，不共享那个高度计算，需要自己单独跟一份安全区偏移，
 * 否则在有 Home Indicator 的设备上会比 Tab 栏顶部还低。这个数值是估算，
 * 真正跟 BottomNav 一起出现在同一屏（找搭子页，04 号卡）时需要肉眼校验
 * 间距是否符合设计稿"12–16px"的要求，必要时再微调。
 *
 * 首页不使用这个组件（首页发布入口已经改成顶部"＋"图标，见 TopBar 的
 * home 变体）——这是页面级的使用决策，不是这个组件自己要处理的逻辑，组件
 * 本身对"谁在用它"没有任何假设。
 */
export function Fab({ label, variant = "default", onClick, disabled }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      className={`fixed left-1/2 z-20 flex h-12 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-6 text-sm font-bold text-white shadow-fab disabled:cursor-not-allowed disabled:opacity-60 ${
        variant === "dark" ? "bg-primary-dark" : "bg-primary"
      }`}
    >
      <Plus size={18} aria-hidden="true" />
      {label}
    </button>
  );
}

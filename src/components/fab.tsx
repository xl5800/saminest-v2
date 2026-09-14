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
// 全 App 视觉 Token 体系（第一批，找搭子页"发起搭子"CTA）：这个组件的圆角
// 保持 rounded-full 不变，没有换成任务卡里"主要 CTA 按钮"提到的新
// --radius-button（14px）——index.css 的圆角表把 999px 的胶囊/圆形按钮
// （Pill 档）和 14px 的矩形主按钮（按钮档）分成两个不同档位，这个组件是
// 悬浮胶囊按钮，形状上属于前者，套用 14px 会把胶囊变成圆角矩形，是视觉
// 倒退，不是任务卡的本意。shadow-fab 这个 class 名字不变，index.css 里
// 对应的数值这次已经更新（透明度从 0.35 降到 0.18、颜色跟随新
// --color-primary 换算），不需要在这个文件里额外改。
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

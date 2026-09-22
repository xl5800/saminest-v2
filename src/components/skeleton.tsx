export interface SkeletonProps {
  className?: string;
}

/**
 * 高频页面骨架屏任务卡：解决"第一次打开点很多页面都先看到一行黑字'加载
 * 中…'/白屏"的闪烁问题——全站在这之前没有一个骨架屏，这是新增的最小
 * 骨架块原语，供各页面组合成贴近真实卡片形状的占位，不是在每个页面各自
 * 定义一套。
 *
 * className 传具体的宽高/圆角（比如 "h-4 w-3/4 rounded-md"），这个组件
 * 本身只负责 animate-pulse（Tailwind 内置工具类，项目里没有覆盖过）+
 * 底色。底色用 bg-border（`--color-border: #e7eaf0`，卡片本身的边框颜色）
 * ——占位块跟卡片边框用同一个颜色语义，不需要为骨架屏专门新增一个 token。
 *
 * aria-hidden="true"：这里只是纯视觉装饰。真正的"正在加载"语义由外层
 * 容器负责——每个接入点都要包一层 `<div role="status"><span
 * className="sr-only">加载中…</span>{骨架块...}</div>`，保留原来
 * `<p role="status">加载中…</p>` 那行文字给屏幕阅读器的播报，只是视觉上
 * 换成骨架块而不是文字，不能让这个组件自己也播报一遍造成重复。
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded-md bg-border ${className ?? ""}`} />
  );
}

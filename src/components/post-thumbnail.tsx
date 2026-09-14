import { Home, ImageOff, Search, Tag } from "lucide-react";

/**
 * 帖子卡片统一视觉（新一轮 UI 审计 P0 #1）：分类专属无图占位的图标选择
 * 逻辑——32 号卡最初写在 post-list.tsx 里、是那个文件的私有函数，这次
 * 连同占位/封面图这一整块展示逻辑一起抽成本文件这个共享组件
 * （PostThumbnail），供 post-list.tsx / my-posts-page.tsx / favorites-page.tsx
 * 三处复用，不再各自维护一套（或者干脆没做，见 favorites-page.tsx 改动前
 * 完全没有缩略图）。
 *
 * 按字符串（不是分类 id/slug）匹配，是 32 号卡当时就定下的简化方案，这次
 * 原样保留：现在分类是固定的三个（rent/wanted/used，见 categories 表种子
 * 数据），按 categoryName 这个中文名字符串匹配足够用，不需要为此专门引入
 * 一张分类 slug→图标的配置表。代价是：以后分类名字改了，或者新增了分类，
 * 这里会静默退回 ImageOff 兜底图标（文案仍然用 categoryName 本身，不会
 * 报错、也不会"猜"一个合适的图标）——这个代价是可以接受的。
 */
export function getCategoryPlaceholderIcon(categoryName: string) {
  switch (categoryName) {
    case "求租":
      return Search;
    case "租房":
      return Home;
    case "二手":
      return Tag;
    default:
      return ImageOff;
  }
}

export interface PostThumbnailProps {
  coverImageUrl: string | null;
  categoryName: string;
  /** 应用在 <img> 和占位 <div> 两个分支共同的容器尺寸/形状 class——由调用方
   *  决定卡片本身的尺寸和圆角，这个组件只负责"图还是占位"这一层判断，不替
   *  调用方做布局决定。post-list.tsx 的网格卡片传 "aspect-[4/5] w-full"，
   *  my-posts-page.tsx/favorites-page.tsx 的 80×80 小方块列表项传
   *  "h-20 w-20 shrink-0 rounded-xl"。 */
  sizeClassName: string;
  /** true 时占位只显示居中图标，不显示分类名文字——给 80×80 这种小尺寸的
   *  列表缩略图用（图标+文字在这么小的方块里放不下，文字会被挤变形）；
   *  网格卡片（post-list.tsx 的 grid variant）保持 false（默认），跟改动
   *  前的视觉完全一致。compact 模式下图标也相应缩小（20px，网格卡片是
   *  28px）——同样是"小尺寸容器配小图标"的观感取舍，不是任务卡强制的
   *  具体数值，是这次实现时目测调出来的，图标既不会显得太大顶到边缘、
   *  也不会小到看不清是什么分类。 */
  compact?: boolean;
  /** 有封面图时 <img> 的 alt 文本，默认空字符串（装饰性图片，不承载额外
   *  的可访问性文本——这是列表缩略图场景的常见约定，比如 person-card.tsx/
   *  post-list.tsx 里 variant="wanted" 卡片的头像都是 alt=""）。
   *  post-list.tsx 的网格卡片改动前用的是 alt={post.title}（有意义的
   *  无障碍文本，帖子标题本来就在图片下方重复展示一遍，但 <img> 的 alt
   *  单独传一份对屏幕阅读器更友好），这里加一个可选 prop 而不是把这个组件
   *  写死成空 alt，保留调用方按场景自己决定的空间——post-list.tsx 继续
   *  传 post.title，其它两个调用点（80×80 小缩略图，标题本来就紧挨着
   *  展示在旁边的文字区）不传，用默认的空字符串。 */
  alt?: string;
}

/**
 * 封面图存在就显示封面图，不存在就显示"分类色底 + 线性图标 +（可选）
 * 分类名文字"的占位——从 post-list.tsx 的 grid variant 原样搬出来，
 * 视觉细节（bg-primary-light 浅蓝底、text-primary 图标/文字颜色、
 * flex flex-col items-center justify-center gap-1.5 的布局）一个像素都
 * 没有改，只是从内联 JSX 变成独立组件，供多处复用。
 *
 * data-testid="post-thumbnail-placeholder" 这个 testid 是从 post-list.tsx
 * 原样保留下来的（post-list.test.tsx 依赖它），三个调用点（post-list.tsx/
 * my-posts-page.tsx/favorites-page.tsx）现在共用同一个 testid——
 * my-posts-page.tsx 改动前用的是它自己的 data-testid="my-post-thumbnail
 * -placeholder"，那是"占位逻辑还没抽出来、各自起了不同名字"这个问题本身
 * 的一部分，这次统一成同一个组件之后自然统一成同一个 testid，
 * my-posts-page.test.tsx 里对应的断言也跟着改了。
 */
export function PostThumbnail({
  coverImageUrl,
  categoryName,
  sizeClassName,
  compact = false,
  alt = ""
}: PostThumbnailProps) {
  if (coverImageUrl) {
    return <img src={coverImageUrl} alt={alt} className={`${sizeClassName} object-cover`} />;
  }

  const PlaceholderIcon = getCategoryPlaceholderIcon(categoryName);
  const iconSize = compact ? 20 : 28;

  return (
    <div
      aria-hidden="true"
      data-testid="post-thumbnail-placeholder"
      className={`flex flex-col items-center justify-center gap-1.5 bg-primary-light ${sizeClassName}`}
    >
      <PlaceholderIcon aria-hidden="true" size={iconSize} className="text-primary" />
      {compact ? null : <span className="text-xs font-medium text-primary">{categoryName}</span>}
    </div>
  );
}

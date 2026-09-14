import { Link } from "react-router-dom";

import { FavoriteButton } from "../../components/favorite-button";
import { PostThumbnail } from "../../components/post-thumbnail";
import { TopBar } from "../../components/top-bar";
import { formatLocationDisplayName } from "../../data/us-states";
import { useFavoritedPostsQuery } from "../../features/favorites/use-favorited-posts-query";
import { formatListingDate, formatPrice } from "../../utils/format";

/**
 * 收藏列表页（/favorites，路由已在 routes.tsx 用 RequireAuth 包裹）。
 *
 * 加载中/失败/空状态沿用 PostList 已有的 role="status" / role="alert"
 * 约定，不发明新的展示方式。取消收藏直接复用 <FavoriteButton
 * postId={...} />（跟 PostList 列表项用法一致），不重新实现收藏/取消收藏
 * 的请求逻辑、RLS 错误提示等——这些 FavoriteButton 内部已经处理好了。
 *
 * 价格/时间格式化复用 utils/format.ts 的 formatPrice /
 * formatListingDate，不在这里重新拼字符串。
 *
 * 21 号卡（二级页面顶部栏简化）：顶部栏从全局 AppHeader（品牌名+发布
 * 按钮）换成 TopBar 的 nav-only 变体、不传 title——页面下面本来就有
 * "我的收藏"这行 <h1> 大标题，顶部栏不需要重复展示标题，只留一个返回
 * 箭头。四个分支（加载中/失败/空/正常列表）都要渲染，不能只加在其中一个
 * 分支，否则加载中/失败态会短暂露出旧的全局 AppHeader；对应地这个路径也
 * 挪进了 app-shell.tsx 的 TOPBAR_MIGRATED_PATTERNS。
 *
 * 帖子卡片统一视觉（新一轮 UI 审计 P0 #1）：这个页面改动前是四种帖子卡片
 * 呈现里唯一"看不到图"的一个（纯文字行），卡片容器也用错了圆角级别
 * （rounded-lg 是 DESIGN.md 给后台管理列表行定的规格，帖子卡片应该用
 * rounded-2xl）。这次对齐 my-posts-page.tsx/activity-card.tsx 已经在用的
 * `rounded-2xl border border-border bg-card shadow-card` 组合，并加上
 * PostThumbnail（见 post-thumbnail.tsx）展示缩略图——有封面图显示封面图，
 * 没有的话显示跟首页信息流一致的"分类色底 + 图标"占位，不再是纯文字。
 * 缩略图用 compact（80×80 小方块，只显示图标不显示分类名文字），跟
 * my-posts-page.tsx 的缩略图是同一个尺寸/同一种 compact 用法，两个"卡片
 * 列表项"场景保持一致。
 *
 * 标题/价格/地区/时间四行文字保留在同一个 <Link> 里（跟改动前一样点击
 * 整段文字都能进详情页），<FavoriteButton> 继续跟这个 Link 平级（改动前
 * 就是这样，不是"可交互按钮嵌套进可点击链接"这种非法结构，这次没有变），
 * 只是位置从"整行最右侧、垂直居中"调整成"这一行的右上角"
 * （`items-start justify-between`）——保证加了缩略图、行高变高之后按钮
 * 还是贴着标题那一行，不会因为整行变高了而显得悬在中间不上不下，点击
 * 区域也不会被缩略图挤小。
 */
export function FavoritesPage() {
  const { data: posts, isPending, isError } = useFavoritedPostsQuery();

  if (isPending) {
    return (
      <main>
        <TopBar variant="nav-only" />
        <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
          <h1 className="mb-4 text-xl font-bold text-text">我的收藏</h1>
          <p role="status" className="text-sm text-text-muted">加载中…</p>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <TopBar variant="nav-only" />
        <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
          <h1 className="mb-4 text-xl font-bold text-text">我的收藏</h1>
          <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            收藏加载失败，请稍后重试。
          </p>
        </div>
      </main>
    );
  }

  if (posts.length === 0) {
    return (
      <main>
        <TopBar variant="nav-only" />
        <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
          <h1 className="mb-4 text-xl font-bold text-text">我的收藏</h1>
          <p role="status" className="text-sm text-text-muted">暂无收藏。</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <TopBar variant="nav-only" />
      <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">我的收藏</h1>
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <li
              key={post.id}
              className="flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-card"
            >
              <PostThumbnail
                coverImageUrl={post.coverImageUrl}
                categoryName={post.categoryName}
                sizeClassName="h-20 w-20 shrink-0 rounded-xl"
                compact
                alt={post.title}
              />
              <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                <Link to={`/post/${post.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="break-words text-sm font-medium text-text">{post.title}</span>
                  <span className="text-sm font-semibold text-text">
                    {formatPrice(post.priceAmount, post.priceLabel, post.currencyCode)}
                  </span>
                  <span className="text-xs text-text-muted">
                    {post.locationName ? formatLocationDisplayName(post.locationName) : "地区未填写"}
                  </span>
                  <span className="text-xs text-text-muted">{formatListingDate(post.createdAt)}</span>
                </Link>
                <FavoriteButton postId={post.id} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

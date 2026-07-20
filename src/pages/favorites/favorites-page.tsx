import { Link } from "react-router-dom";

import { FavoriteButton } from "../../components/favorite-button";
import { useFavoritedPostsQuery } from "../../features/favorites/use-favorited-posts-query";
import { formatPrice, formatPublishedAt } from "../../utils/format";

/**
 * 收藏列表页（/favorites，路由已在 routes.tsx 用 RequireAuth 包裹）。
 *
 * 加载中/失败/空状态沿用 PostList 已有的 role="status" / role="alert"
 * 约定，不发明新的展示方式。取消收藏直接复用 <FavoriteButton
 * postId={...} />（跟 PostList 列表项用法一致），不重新实现收藏/取消收藏
 * 的请求逻辑、RLS 错误提示等——这些 FavoriteButton 内部已经处理好了。
 *
 * 价格/发布时间格式化复用 utils/format.ts 的 formatPrice /
 * formatPublishedAt，不在这里重新拼字符串。
 */
export function FavoritesPage() {
  const { data: posts, isPending, isError } = useFavoritedPostsQuery();

  if (isPending) {
    return (
      <main>
        <h1>我的收藏</h1>
        <p role="status">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <h1>我的收藏</h1>
        <p role="alert">收藏加载失败，请稍后重试。</p>
      </main>
    );
  }

  if (posts.length === 0) {
    return (
      <main>
        <h1>我的收藏</h1>
        <p role="status">暂无收藏。</p>
      </main>
    );
  }

  return (
    <main>
      <h1>我的收藏</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <Link to={`/post/${post.id}`}>
              <span>{post.title}</span>
              <span>{formatPrice(post.priceAmount, post.priceLabel, post.currencyCode)}</span>
              <span>{post.locationName ?? "地区未填写"}</span>
              <span>{formatPublishedAt(post.publishedAt)}</span>
            </Link>
            <FavoriteButton postId={post.id} />
          </li>
        ))}
      </ul>
    </main>
  );
}

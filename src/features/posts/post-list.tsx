import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { formatPrice, isPriceUnset } from "../../utils/format";
import { usePostsInfiniteQuery } from "./use-posts-query";

export interface PostListProps {
  categoryId?: string;
  searchQuery?: string;
}

/**
 * 可复用的帖子列表：首页和分类页都用这一个组件，靠 categoryId 区分。
 * 以后"我的帖子"、"收藏列表"如果也是"无限滚动 + 列表项"的形态，优先扩展
 * 这里而不是照抄一份。
 *
 * 渲染成"瀑布流双列"卡片网格：用原生 CSS 多栏布局（columns-2）而不是
 * CSS grid——grid 会强制同一行的卡片等高，做不出瀑布流那种"高矮不一、
 * 哪栏矮就往哪栏排"的效果；也不引入额外的 JS masonry 库，多栏布局本身
 * 就能达到效果。每张卡片加 break-inside-avoid，防止内容被从中间断开
 * 到下一栏。
 *
 * 卡片改版成 Facebook Marketplace 那种"扫一眼知道是什么、多少钱、在哪"的
 * 精简样式：只保留封面图、标题、价格、分类/地区。原来卡片上的作者名字、
 * 发布时间、收藏数/评论数、FavoriteButton 都去掉了——列表页不需要承载这些
 * 社交互动信息，详情页仍然完整展示（详情页是单独的次要信息区块）。
 *
 * Meet5 风格改版（02-home-page.md）：布局从原生 CSS 多栏瀑布流
 * （columns-2，高矮不一、哪栏矮就往哪栏排）换成规规矩矩的两列网格
 * （grid grid-cols-2），跟设计稿"两列网格"的措辞和视觉稿的 CSS Grid 布局
 * 一致——这个组件是首页和分类页共用的（见上面这段注释），改动会同时影响
 * 两个页面的卡片排布，这是预期内的，不是意外扩大范围：分类页目前还没有
 * 自己的视觉稿，沿用跟首页同一套卡片视觉是合理的默认，而不是保留一份
 * 旧样式制造两套不一致的信息流卡片。图片比例从 4:3 改成 16:9（Tailwind
 * 内置的 aspect-video 正好是 16:9，不需要写 aspect-[16/9] 这种任意值）；
 * 卡片本身去掉边框和投影（`shadow-card`/`border-border`）——设计稿明确
 * 要求这批新卡片"圆角 16px、白底、无阴影"。
 *
 * 价格文字：`isPriceUnset` 命中时（既没有价格标签也没有具体金额）用弱化的
 * 灰色展示"价格未填写"，跟真实价格的黑色加粗区分开，见 format.ts 里
 * 这个函数的注释。分类标签从原来的中性灰底改成 `bg-primary-light` +
 * `text-primary`（浅蓝底蓝字），呼应设计稿"分类标签：浅蓝底 + 蓝字"的
 * 要求。
 *
 * 分页按钮已经删掉了（今晚早些时候的改动），这里用"哨兵元素 +
 * IntersectionObserver"实现无限滚动：列表底部放一个不可见的哨兵 div，
 * 它进入视口时触发 fetchNextPage()。哨兵只在 hasNextPage 为真时渲染——
 * 没有下一页时彻底不挂这个元素，而不是渲染出来但不响应，避免它一直
 * 空占着 DOM/被观察却永远不会有意义地触发。
 */
export function PostList({ categoryId, searchQuery }: PostListProps) {
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePostsInfiniteQuery({ categoryId, searchQuery });

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isPending) {
    return <p role="status">加载中…</p>;
  }

  if (isError) {
    return <p role="alert">帖子加载失败，请稍后重试。</p>;
  }

  const posts = data.pages.flatMap((page) => page.posts);

  if (posts.length === 0) {
    return <p role="status">{searchQuery ? "没有找到相关帖子。" : "暂无帖子。"}</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {posts.map((post) => {
          const priceUnset = isPriceUnset(post.priceAmount, post.priceLabel);
          return (
            <Link
              key={post.id}
              to={`/post/${post.id}`}
              className="block overflow-hidden rounded-2xl bg-card"
            >
              {post.coverImageUrl ? (
                <img
                  src={post.coverImageUrl}
                  alt={post.title}
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  data-testid="post-thumbnail-placeholder"
                  className="flex aspect-video w-full items-center justify-center bg-border text-2xl"
                >
                  🖼
                </div>
              )}
              <div className="space-y-1 p-2.5">
                <p className="line-clamp-2 break-words text-sm text-text">{post.title}</p>
                <p
                  className={
                    priceUnset
                      ? "text-sm font-medium text-text-muted"
                      : "text-base font-semibold text-text"
                  }
                >
                  {formatPrice(post.priceAmount, post.priceLabel, post.currencyCode)}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-primary-light px-1.5 py-0.5 text-xs font-medium text-primary">
                    {post.categoryName}
                  </span>
                  <span className="text-xs text-text-muted">
                    {post.locationName ?? "地区未填写"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {hasNextPage ? <div ref={sentinelRef} aria-hidden="true" /> : null}
      {isFetchingNextPage ? <p role="status">加载更多…</p> : null}
    </div>
  );
}

import { MapPin } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { formatLocationDisplayName } from "../../data/us-states";
import { formatPrice, formatWantedPosterMeta, isPriceUnset } from "../../utils/format";
import { usePostsInfiniteQuery } from "./use-posts-query";

export interface PostListProps {
  categoryId?: string;
  searchQuery?: string;
  /** 08 号卡新增：透传给 usePostsInfiniteQuery 的州筛选。同时也是判断要不要
   *  展示"这个地区还没有内容"空状态的依据——见下面 isRegionEmptyState 的
   *  说明。 */
  stateCode?: string;
  /** 08 号卡新增：地区空状态里"去发布"按钮的点击回调。PostList 本身不知道
   *  "选择发布类型"弹层长什么样、由谁控制开关（那是 HomePage 已经有的
   *  publishSheetOpen/PublishActionSheet），只负责暴露这个点击事件，调用方
   *  决定点了之后具体发生什么——不传时不渲染这个按钮（理论上 stateCode 有
   *  值就应该配一个 onPublishClick，但不强制，保持这个组件在没有发布入口
   *  的场景下也能单独使用）。 */
  onPublishClick?: () => void;
  /** 22 号卡新增：发帖者主页"发布的作品"网格用——只请求/展示某一个作者的
   *  帖子，透传给 usePostsInfiniteQuery。不传时行为完全不变（首页/分类页
   *  两个既有调用点都不传这个 prop）。跟 categoryId/stateCode 一样，只是
   *  多一个可选筛选维度，不是另建一份组件——见 use-posts-query.ts 顶部
   *  注释"以后'我的帖子'、'收藏列表'等页面需要类似的列表时，优先扩展这里
   *  而不是照抄一份"。 */
  authorId?: string;
  /** 31 号卡（求租板块改版）新增：首页"推荐"流（未选中任何具体分类）排除
   *  求租分类帖子用，透传给 usePostsInfiniteQuery——见该 hook/
   *  listApprovedPosts 里对应字段的注释。只有 home-page.tsx 在
   *  activeCategorySlug 为空（"推荐"）时会传这个值，"求租" Tab 本身、以及
   *  authorId 传值的发帖者主页场景都不传，求租帖子在那些地方不受影响。 */
  excludeCategoryId?: string;
  /** 31 号卡新增："求租" Tab 用单列纯文字卡片（variant="wanted"），其它
   *  三个 Tab（推荐/租房/二手）继续用默认的两列图片网格
   *  （variant="grid"，也是不传时的默认值）——两种布局的容器结构本来就
   *  不一样，不是在现有 .map() 里加 if/else 判断每张卡片，而是整个渲染
   *  路径分两套，见下面组件内部的实现。 */
  variant?: "grid" | "wanted";
}

/**
 * 可复用的帖子列表：首页（唯一实际渲染入口，见该文件顶部注释）用这一个
 * 组件，靠 categoryId 区分推荐/租房/求租/二手四个 Tab——19 号卡确认过，
 * "分类"独立页面（categories-page.tsx）本身不渲染帖子卡片，只是一组
 * tile，点击后跳回首页带 `?category=` 参数，实际渲染卡片的地方只有这里
 * 一处，改这一个文件就覆盖了全部四个 Tab，不需要额外找别的卡片组件。
 * 以后"我的帖子"、"收藏列表"如果也是"无限滚动 + 列表项"的形态，优先扩展
 * 这里而不是照抄一份。
 *
 * 两列网格（grid grid-cols-2）保持整齐对齐，不做瀑布流——19 号卡「参考
 * Craigslist 简化布局」明确要求"这次选的是折中方案，不是真瀑布流"：两列
 * 保持等高对齐，只把图片区域的高宽比调高，不做"每张图保持各自原始比例、
 * 两列参差不齐"那种真瀑布流（那个实现复杂、容易有布局跳动问题）。
 *
 * 19 号卡「帖子卡片改版」把卡片精简成 Craigslist App 那种"图片区域占比
 * 更大、底部只有标题+价格"的风格：
 * - 图片区域从 16:9（Meet5 风格改版留下的横向比例）改成 4:5（更接近人像
 *   照片的竖向比例，落在任务卡给的 3:4～4:5 区间内，取区间内观感更协调
 *   的一端，不强求跟参考图像素级一致），用 Tailwind 任意值 `aspect-[4/5]`
 *   （没有对应的内置刻度）。
 * - 底部文字区域从"标题（2 行）+ 价格 + 分类/地区"四行精简成"标题
 *   （单行，超出用省略号截断）+ 价格"两行——分类标签 pill 和地点文字
 *   整个去掉，不再展示在卡片上（详情页仍然完整展示这些信息，卡片只是
 *   列表页的精简入口）。
 * - 价格行**只有真的有价格数据时才渲染**：`isPriceUnset` 命中（既没有
 *   价格标签也没有具体金额）时价格这个 `<p>` 整个不渲染，不是渲染出来
 *   显示"价格未填写"这几个字——标题下面直接是卡片底边，不留一行占位的
 *   空隙。这是这次改动的行为变化：改版前 `isPriceUnset` 命中时会展示灰色
 *   的"价格未填写"占位文案，见 format.ts 里 `formatPrice`/`isPriceUnset`
 *   这两个函数本身没有改（依然是同一套判断/格式化逻辑，只是这一层展示
 *   决定"不 unset 才渲染"，不是"unset 时换一种文案/颜色渲染"）。
 *
 * 原来卡片上的作者名字、发布时间、收藏数/评论数、FavoriteButton 更早之前
 * 就已经去掉了（Facebook Marketplace 风格那次改版）——列表页不需要承载
 * 这些社交互动信息，详情页仍然完整展示。卡片本身依旧无边框/无投影
 * （`overflow-hidden rounded-2xl bg-card`），这条这次没有变。
 *
 * 分页：用"哨兵元素 + IntersectionObserver"实现无限滚动：列表底部放一个
 * 不可见的哨兵 div，它进入视口时触发 fetchNextPage()。哨兵只在
 * hasNextPage 为真时渲染——没有下一页时彻底不挂这个元素，而不是渲染出来
 * 但不响应，避免它一直空占着 DOM/被观察却永远不会有意义地触发。
 *
 * 31 号卡（求租板块改版）：variant="wanted" 时（只有"求租" Tab 会传）改成
 * 单列纯文字卡片——不是在下面这个 grid grid-cols-2 的 .map() 里塞
 * if/else 判断每张卡片长什么样，是外层直接分两套 JSX（见下面
 * renderWantedList/常规网格两段），loading/error/空状态这几个跟布局无关
 * 的分支保持共用，不重复。
 *
 * 求租卡片内容（按讨论确认的顺序，缺失字段优雅省略）：
 * 1. 标题——line-clamp-2（两行截断，文字卡片横向空间更宽，不用像网格卡片
 *    那样单行就截断）。
 * 2. 价格——isPriceUnset 命中就整行不渲染，逻辑跟网格卡片/详情页共用同一套
 *    isPriceUnset/formatPrice，价格用 text-text 黑色（不用强调蓝，DESIGN.md
 *    "价格永远黑色"的约定）。
 * 3. 州（post.locationName，格式化复用 formatLocationDisplayName，跟页面
 *    顶部"地区"那一行、profiles-repository.ts 的现有用法一致）——为
 *    null 就整行不渲染，不展示"地区未填写"占位文案；求租帖子的"地区"字段
 *    要不要在校验层面强制必填是开放问题，这次没有在这里加特殊处理。
 * 4. 发帖人信息行——24px 圆形头像（没有头像时的兜底样式照抄
 *    person-card.tsx 的 bg-primary/10 text-primary 首字母圆圈，只是尺寸从
 *    40px 缩小到 24px、字号缩小到 text-[10px]）+ 昵称 + 性别/年龄
 *    （formatWantedPosterMeta，见 utils/format.ts，两者都缺失时这一段
 *    整个不渲染）。
 *
 * 不展示分类标签 chip、发布时间——讨论时明确没有列进要展示的字段（这个
 * Tab 下分类标签本来就是多余信息，列表已经按 created_at 降序排列，不需要
 * 在卡片上重复标出发布时间）。
 */
export function PostList({
  categoryId,
  searchQuery,
  stateCode,
  onPublishClick,
  authorId,
  excludeCategoryId,
  variant = "grid"
}: PostListProps) {
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePostsInfiniteQuery({ categoryId, searchQuery, stateCode, authorId, excludeCategoryId });

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

  // 08 号卡 8.4：空状态优先级——正在搜索时，零结果永远是"没有找到相关
  // 帖子"（用户意图是找一个具体的东西，"去发布"跟这个意图不搭），跟有没有
  // 选中地区无关；没有搜索、选中了某个州、这个州（在当前分类 tab 下）没有
  // 内容，才展示"这个地区还没有内容"+去发布的引导——这个空状态明确要求
  // "选中了某个州"这个前提，未选择州时零结果一律退回原来的"暂无帖子"。
  if (posts.length === 0) {
    if (!searchQuery && stateCode) {
      return (
        <div
          role="status"
          className="flex flex-col items-center gap-3 px-6 py-12 text-center"
        >
          <MapPin aria-hidden="true" size={32} className="text-text-subtle" />
          <p className="text-sm text-text-muted">这个地区还没有内容，欢迎发布第一条</p>
          {onPublishClick ? (
            <button
              type="button"
              onClick={onPublishClick}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              去发布
            </button>
          ) : null}
        </div>
      );
    }
    return <p role="status">{searchQuery ? "没有找到相关帖子。" : "暂无帖子。"}</p>;
  }

  if (variant === "wanted") {
    return (
      <div>
        <div className="flex flex-col gap-3 px-4">
          {posts.map((post) => {
            const priceUnset = isPriceUnset(post.priceAmount, post.priceLabel);
            const posterMeta = formatWantedPosterMeta(post.posterGender, post.posterAge);
            return (
              <Link
                key={post.id}
                to={`/post/${post.id}`}
                className="block rounded-2xl bg-card p-4 shadow-card"
              >
                <p className="line-clamp-2 break-words text-base font-medium text-text">
                  {post.title}
                </p>
                {priceUnset ? null : (
                  <p className="mt-1 text-lg font-semibold text-text">
                    {formatPrice(post.priceAmount, post.priceLabel, post.currencyCode)}
                  </p>
                )}
                {post.locationName ? (
                  <p className="mt-1 flex items-center gap-1 text-sm text-text-muted">
                    <MapPin aria-hidden="true" size={14} className="shrink-0" />
                    {formatLocationDisplayName(post.locationName)}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  {post.authorAvatarUrl ? (
                    <img
                      src={post.authorAvatarUrl}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
                    >
                      {post.authorDisplayName.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                  )}
                  <span className="text-sm text-text">{post.authorDisplayName}</span>
                  {posterMeta ? (
                    <span className="text-sm text-text-subtle">{posterMeta}</span>
                  ) : null}
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
                  className="aspect-[4/5] w-full object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  data-testid="post-thumbnail-placeholder"
                  className="flex aspect-[4/5] w-full items-center justify-center bg-border text-2xl"
                >
                  🖼
                </div>
              )}
              <div className="space-y-0.5 p-2.5">
                <p className="truncate text-sm text-text">{post.title}</p>
                {priceUnset ? null : (
                  <p className="text-base font-semibold text-text">
                    {formatPrice(post.priceAmount, post.priceLabel, post.currencyCode)}
                  </p>
                )}
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

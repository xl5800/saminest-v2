import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CommunityPostActionBar } from "../../components/community-post-action-bar";
import { PostImageCarousel } from "../../components/post-image-carousel";
import { PublishActionSheet } from "../../components/publish-action-sheet";
import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { formatSelectedRegionLabel } from "../../data/us-states";
import { useCommunityPostsInfiniteQuery } from "../../features/community/use-community-posts-query";
import { useMyCommunitiesQuery } from "../../features/community/use-my-communities-query";
import { useAuthStore } from "../../store/auth-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { formatRelativeTimeAgo } from "../../utils/format";
import {
  COMMUNITY_POST_LIST_PREVIEW_CLASS_NAME,
  COMMUNITY_POST_LIST_TITLE_CLASS_NAME
} from "../community/community-post-type";

const SKELETON_COUNT = 4;

const REGION_SELECT_PATH = "/region-select";
const SEARCH_PATH = "/search";

/** 社区入口统一路径。这里直接写死字符串而不是从 router/routes.tsx 引常量：
 *  routes.tsx 是并行任务卡（阶段九/十/十一）也在改的文件，这张卡不碰它。 */
const COMMUNITY_PATH = "/community";

/**
 * 首页（`/`）——阶段八起是"社区聚合 Feed"。
 *
 * 原来挂在这里的"推荐/租房/二手/求租"分类信息流（带分类 Chips、搜索、求租
 * 单列卡片）整体搬到了底部导航的"分类"Tab（pages/categories/
 * categories-page.tsx，路径 `/categories`），逻辑原样保留。这个页面是社区聚合
 * Feed。
 *
 * 数据范围（阶段十三，个性化优先）：
 * - 用户已经加入了至少一个社区 → 只聚合这些已加入社区的帖子；
 * - 一个社区都没加入（游客，或者刚注册还没点过"加入"的新用户）→ 展示全部社区
 *   的帖子作为兜底内容，同时在信息流上方显示一条引导横幅，跳 /community（社区
 *   浏览页）去加入社区。横幅纯粹跟着"已加入数量是否为 0"走，加入任意一个社区后
 *   下次渲染自动消失，没有关闭交互。
 * - 这个兜底只是内容展示层面的，**不会**帮用户创建 community_members 记录——
 *   整个应用已经没有任何"静默自动加入"，用户必须自己点"加入"才算数。
 * - 已登录用户的"已加入列表"还没加载出来之前不发帖子请求（范围未知），统一
 *   展示骨架屏；已加入列表加载失败时退回"全部社区"兜底、不显示引导横幅（拿不到
 *   列表不等于用户没加入，不该错误地告诉 TA"还没加入任何社区"）。
 *
 * 结构（自上而下）：
 * - TopBar home 变体：Saminest + 地区按钮（点击去 /region-select，地区目前
 *   只是展示，社区帖子没有地区维度，不做筛选）、"＋"打开 PublishActionSheet、
 *   搜索图标（跳全站搜索页 /search，同时搜社区和社区帖子）。
 * - "推荐"Tab：固定的蓝色下划线标题，没有任何切换逻辑，只是给后面"关注/最新"
 *   之类的 Tab 预留视觉位置。
 * - （零加入时）引导加入社区的横幅。原来顶部的"我的社区"横向卡片区已经删掉——
 *   "我在哪些社区"这个信息改成每条帖子上可点击的社区名标签（点了去对应社区的
 *   Feed 页）。
 * - 帖子流：标题和正文分开展示，行与行之间用底部分隔线隔开，不是带边框的
 *   卡片。分页沿用社区 Feed 页同一套"哨兵元素 + IntersectionObserver"
 *   无限滚动。
 * - 操作行：CommunityPostActionBar（评论数 / 收藏 / 分享，跟详情页同一套线条
 *   图标，只放图标和数字）。**没有点赞图标**——社区帖子 v1 没有点赞。分享是
 *   复制帖子链接，跟详情页一致。
 *
 * 社区名标签是独立的 <Link>，不嵌在"去详情页"那个 <Link> 里——<a> 里嵌 <a> 是
 * 非法 HTML，而且点标签会同时触发外层导航；所以卡片顶部一行拆成"作者信息链接
 * （去详情页）+ 社区标签链接（去社区 Feed）"两个并列的链接。帖子是公开可读的，
 * 游客也能看到首页的社区帖子流。
 *
 * 图片区域跟 /community Feed 页、帖子详情页同一个样子——文字在上、满宽的
 * PostImageCarousel 在下（一次一张、多张可滑动 + 圆点指示器），不用旁边的小
 * 方块缩略图，直接复用 post.images（不再用 coverImageUrl 渲染单独的缩略图）。
 */
export function HomePage() {
  const navigate = useNavigate();
  const [publishSheetOpen, setPublishSheetOpen] = useState(false);
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  // 游客不查已加入列表（enabled 被 userId 挡住），直接按"零加入"处理。
  const { data: myCommunities, isError: myCommunitiesError } = useMyCommunitiesQuery(userId);
  const joinedIds = myCommunities?.map((community) => community.id);

  // undefined = 范围未知（已登录但已加入列表还没回来），帖子查询先不发。
  let scope: string[] | "all" | undefined;
  if (!userId || myCommunitiesError) {
    scope = "all";
  } else if (joinedIds) {
    scope = joinedIds.length > 0 ? joinedIds : "all";
  }
  const showJoinBanner = !userId || (joinedIds !== undefined && joinedIds.length === 0);

  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCommunityPostsInfiniteQuery(scope);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
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

  const posts = data?.pages.flatMap((page) => page.posts) ?? [];

  function renderFeed() {
    if (isError) {
      return (
        <p role="alert" className="px-4 py-6 text-sm text-text-muted">
          社区加载失败，请稍后重试。
        </p>
      );
    }

    // 已加入列表还没返回时 scope 是 undefined，帖子查询被 enabled 挡住、
    // isPending 也为 true，统一展示骨架屏。
    if (isPending) {
      return (
        <div role="status">
          <span className="sr-only">加载中…</span>
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <div key={index} className="border-b border-divider px-4 py-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-5 w-4/5" />
              <Skeleton className="mt-2 h-4 w-full" />
            </div>
          ))}
        </div>
      );
    }

    if (posts.length === 0) {
      return (
        <div role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-text-muted">暂无帖子，欢迎发布第一条</p>
          <Link
            to={`${COMMUNITY_PATH}/new`}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            去发布
          </Link>
        </div>
      );
    }

    return (
      <div>
        <ul>
          {posts.map((post) => {
            const hasTitle = Boolean(post.title);
            return (
              <li key={post.id} className="border-b border-divider px-4 py-4">
                {/* 顶部一行：作者信息（去详情页）+ 社区名标签（去社区 Feed）是两个
                    并列的链接，不能嵌套，见组件顶部注释。 */}
                <div className="flex items-center gap-2">
                  <Link
                    to={`${COMMUNITY_PATH}/post/${post.id}`}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    {post.authorAvatarUrl ? (
                      <img
                        src={post.authorAvatarUrl}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-[10px] font-semibold text-primary"
                      >
                        {post.authorDisplayName.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                    <span className="min-w-0 truncate text-sm text-text">
                      {post.authorDisplayName}
                    </span>
                    <span className="shrink-0 text-xs text-text-subtle">
                      {formatRelativeTimeAgo(post.createdAt)}
                    </span>
                  </Link>
                  {post.communitySlug ? (
                    <Link
                      to={`${COMMUNITY_PATH}/${post.communitySlug}`}
                      className="max-w-[45%] shrink-0 truncate rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary"
                    >
                      {post.communityName}
                    </Link>
                  ) : null}
                </div>
                {/* 内容区是一个整体链接去详情页；操作行（收藏/分享）在链接
                    外面，避免按钮嵌进 <a> 里，也不依赖 stopPropagation。 */}
                <Link to={`${COMMUNITY_PATH}/post/${post.id}`} className="mt-2 block">
                  <div className="min-w-0">
                    {/* 有标题：标题 + 正文预览分开；没有标题：正文前两行
                        当标题，不重复展示预览——跟 /community 页同一规则。 */}
                    {hasTitle ? (
                      <>
                        <p className={COMMUNITY_POST_LIST_TITLE_CLASS_NAME}>{post.title}</p>
                        <p className={`mt-1 ${COMMUNITY_POST_LIST_PREVIEW_CLASS_NAME}`}>
                          {post.body}
                        </p>
                      </>
                    ) : (
                      <p className={COMMUNITY_POST_LIST_TITLE_CLASS_NAME}>{post.body}</p>
                    )}
                  </div>
                  {/* 图片在文字下方、满宽展示，跟 /community Feed 页、帖子
                      详情页同一个 PostImageCarousel；没有图片时不渲染任何
                      占位，保持纯文字。这里不传 onImageClick：整张卡片已经
                      是外层的 <Link>，静止点击图片直接冒泡跳详情页。 */}
                  {post.images.length > 0 ? (
                    <div className="mt-3">
                      <PostImageCarousel images={post.images} aspectRatio="4 / 3" />
                    </div>
                  ) : null}
                </Link>
                <CommunityPostActionBar
                  communityPostId={post.id}
                  commentCount={post.commentCount}
                  favoriteCount={post.favoriteCount}
                />
              </li>
            );
          })}
        </ul>
        {hasNextPage ? <div ref={sentinelRef} aria-hidden="true" /> : null}
        {isFetchingNextPage ? <p role="status" className="py-3 text-center text-sm text-text-muted">加载更多…</p> : null}
      </div>
    );
  }

  return (
    <main data-testid="home-page">
      <TopBar
        variant="home"
        regionLabel={selectedRegion ? formatSelectedRegionLabel(selectedRegion) : null}
        onRegionClick={() => navigate(REGION_SELECT_PATH)}
        onCreateClick={() => setPublishSheetOpen(true)}
        onSearchClick={() => navigate(SEARCH_PATH)}
        bottomSlot={
          <div className="px-4">
            <span
              aria-current="page"
              className="inline-block border-b-2 border-primary py-2 text-base font-semibold text-primary"
            >
              推荐
            </span>
          </div>
        }
      />

      {showJoinBanner ? (
        <Link
          to={COMMUNITY_PATH}
          className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-card-lg bg-primary-light px-4 py-3 text-sm text-primary"
        >
          <span>还没加入任何社区？去看看有哪些社区可以加入</span>
          <span aria-hidden="true" className="shrink-0 font-semibold">
            去看看 ›
          </span>
        </Link>
      ) : null}

      <div className="mt-4 pb-24 md:pb-6">{renderFeed()}</div>

      {publishSheetOpen ? <PublishActionSheet onClose={() => setPublishSheetOpen(false)} /> : null}
    </main>
  );
}

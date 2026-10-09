import { MessageCircle, Plus, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CommunityPostFavoriteButton } from "../../components/community-post-favorite-button";
import { PublishActionSheet } from "../../components/publish-action-sheet";
import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { formatSelectedRegionLabel } from "../../data/us-states";
import { useCommunityPostsInfiniteQuery } from "../../features/community/use-community-posts-query";
import { useDmvCommunityQuery } from "../../features/community/use-dmv-community-query";
import { useJoinCommunityMutation } from "../../features/community/use-join-community-mutation";
import { useAuthStore } from "../../store/auth-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { formatRelativeTimeAgo } from "../../utils/format";
import {
  COMMUNITY_POST_TYPE_PILL_CLASS_NAME,
  getCommunityPostTypeLabel
} from "../community/community-post-type";

const SKELETON_COUNT = 4;

const REGION_SELECT_PATH = "/region-select";

/** 社区入口统一路径。这里直接写死字符串而不是从 router/routes.tsx 引常量：
 *  routes.tsx 是并行任务卡（阶段九/十/十一）也在改的文件，这张卡不碰它。 */
const COMMUNITY_PATH = "/community";

/**
 * 首页（`/`）——阶段八起是"社区聚合 Feed"。
 *
 * 原来挂在这里的"推荐/租房/二手/求租"分类信息流（带分类 Chips、搜索、求租
 * 单列卡片）整体搬到了底部导航的"分类"Tab（pages/categories/
 * categories-page.tsx，路径 `/categories`），逻辑原样保留。这个页面换成了
 * 全新的内容：所有已加入社区的帖子聚合成一条扁平的信息流。v1 只有一个 DMV
 * 社区，所以实际就是 DMV 社区的帖子流，数据直接复用社区 Feed 页
 * （/community）已有的 hook（useDmvCommunityQuery +
 * useCommunityPostsInfiniteQuery），没有新增 repository 函数。
 *
 * 结构（自上而下）：
 * - TopBar home 变体：Saminest + 地区按钮（点击去 /region-select，地区目前
 *   只是展示，社区帖子没有地区维度，不做筛选）、"＋"打开 PublishActionSheet、
 *   搜索图标。社区暂时没有搜索能力，搜索图标先跳 /community 当占位——等社区
 *   搜索做出来再换成真正的搜索。
 * - "推荐"Tab：固定的蓝色下划线标题，没有任何切换逻辑，只是给后面"关注/最新"
 *   之类的 Tab 预留视觉位置。
 * - "我的社区"横向卡片行：DMV 社区卡片 + 虚线"加入更多"卡片，都链接到
 *   /community。Community 类型目前只有 {id,name,slug}，没有成员数/新帖数，
 *   所以卡片上的"新动态"数量先留空，等后端补字段再显示。
 * - 帖子流：标题和正文分开展示，行与行之间用底部分隔线隔开，不是带边框的
 *   卡片。分页沿用社区 Feed 页同一套"哨兵元素 + IntersectionObserver"
 *   无限滚动。
 * - 操作行：评论数 / 收藏（CommunityPostFavoriteButton）/ 分享。**没有点赞
 *   图标**——社区帖子 v1 没有点赞。分享是这张卡新增的产品决策，还没有确认
 *   具体行为，所以先做成不可点的占位按钮（disabled），没有任何分享逻辑。
 *
 * 静默加入：跟 /community 页完全一致——已登录用户进来时在后台调一次
 * joinCommunity（重复加入由 repository 当作已是成员），不展示任何提示，
 * 失败也不阻塞浏览；未登录不调用。帖子是公开可读的，游客也能看到首页的
 * 社区帖子流。
 */
export function HomePage() {
  const navigate = useNavigate();
  const [publishSheetOpen, setPublishSheetOpen] = useState(false);
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: community, isError: communityError } = useDmvCommunityQuery();
  const communityId = community?.id;

  const { mutate: joinCommunityMutate } = useJoinCommunityMutation();
  useEffect(() => {
    if (!communityId || !userId) return;
    // 静默加入：成功/失败都不展示任何提示，见组件顶部注释。
    joinCommunityMutate({ communityId, userId });
  }, [communityId, userId, joinCommunityMutate]);

  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCommunityPostsInfiniteQuery(communityId);

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
    if (communityError || isError) {
      return (
        <p role="alert" className="px-4 py-6 text-sm text-text-muted">
          社区加载失败，请稍后重试。
        </p>
      );
    }

    // 社区本身（拿 id）还没返回时 communityId 是 undefined，帖子查询被
    // enabled 挡住、isPending 也为 true，统一展示骨架屏。
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
                {/* 内容区是一个整体链接去详情页；操作行（收藏/分享）在链接
                    外面，避免按钮嵌进 <a> 里，也不依赖 stopPropagation。 */}
                <Link to={`${COMMUNITY_PATH}/post/${post.id}`} className="block">
                  <div className="flex items-center gap-2">
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
                    <span className={`${COMMUNITY_POST_TYPE_PILL_CLASS_NAME} ml-auto shrink-0`}>
                      {getCommunityPostTypeLabel(post.postType)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      {/* 有标题：标题 + 正文预览分开；没有标题：正文前两行
                          当标题，不重复展示预览——跟 /community 页同一规则。 */}
                      {hasTitle ? (
                        <>
                          <p className="line-clamp-2 break-words text-base font-semibold text-text">
                            {post.title}
                          </p>
                          <p className="mt-1 line-clamp-2 break-words text-sm text-text-muted">
                            {post.body}
                          </p>
                        </>
                      ) : (
                        <p className="line-clamp-2 break-words text-base font-semibold text-text">
                          {post.body}
                        </p>
                      )}
                    </div>
                    {post.coverImageUrl ? (
                      <img
                        src={post.coverImageUrl}
                        alt=""
                        loading="lazy"
                        className="h-16 w-16 shrink-0 rounded-lg object-cover"
                      />
                    ) : null}
                  </div>
                </Link>
                <div className="mt-3 flex items-center gap-6 text-text-muted">
                  <span
                    aria-label={`${post.commentCount} 条评论`}
                    className="flex items-center gap-1 text-sm"
                  >
                    <MessageCircle aria-hidden="true" size={18} />
                    {post.commentCount}
                  </span>
                  <CommunityPostFavoriteButton communityPostId={post.id} />
                  {/* 分享：占位。具体行为（复制链接/系统分享面板）还没确认，
                      先不做任何逻辑，disabled 避免用户点了没反应。 */}
                  <button
                    type="button"
                    disabled
                    aria-label="分享"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text-muted opacity-60"
                  >
                    <Share2 aria-hidden="true" size={18} />
                  </button>
                </div>
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
        onSearchClick={() => navigate(COMMUNITY_PATH)}
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

      <section aria-label="我的社区" className="px-4 pt-4">
        <h2 className="text-base font-semibold text-text">我的社区</h2>
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
          <Link
            to={COMMUNITY_PATH}
            className="flex w-28 shrink-0 flex-col items-center gap-2 rounded-card-lg border border-border bg-card-white px-3 py-4 shadow-card"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-xs font-bold text-primary"
            >
              DMV
            </span>
            <span className="max-w-full truncate text-sm font-medium text-text">
              {community?.name ?? "DMV 社区"}
            </span>
            {/* 新动态数量：Community 类型暂时没有成员数/新帖数，先留空占位。 */}
            <span className="h-4 text-xs text-text-subtle" />
          </Link>
          <Link
            to={COMMUNITY_PATH}
            className="flex w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-card-lg border border-dashed border-border px-3 py-4 text-text-muted"
          >
            <Plus aria-hidden="true" size={20} />
            <span className="text-sm">加入更多</span>
          </Link>
        </div>
      </section>

      <div className="mt-4 pb-24 md:pb-6">{renderFeed()}</div>

      {publishSheetOpen ? <PublishActionSheet onClose={() => setPublishSheetOpen(false)} /> : null}
    </main>
  );
}

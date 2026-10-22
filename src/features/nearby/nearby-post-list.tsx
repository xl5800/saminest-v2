import { Fragment, useEffect, useRef } from "react";

import { Skeleton } from "../../components/skeleton";
import { useBlockedUserIds } from "../blocks/use-blocked-user-ids";
import { useNearbyPostsInfiniteQuery } from "../posts/use-nearby-posts-query";
import { PostGridCard, WantedPostCard } from "../posts/post-list";
import type { NearbyLocation } from "../../store/nearby-location-store";
import { formatDistanceMiles } from "../../utils/format-distance";

const SKELETON_COUNT = 4;

export interface NearbyPostListProps {
  location: NearbyLocation;
  radiusMiles: number;
  categorySlugs: string[];
  /** grid：图片网格（二手、出租）；wanted：纯文字卡片（求租）。 */
  variant?: "grid" | "wanted";
  /** 房屋页：范围内按发布时间从新到旧（房源过期快，先看新的）；不传按距离从近到远（首页二手）。 */
  newestFirstWithinRadius?: boolean;
  searchQuery?: string;
  emptyText: string;
  onPublishClick: () => void;
}

/**
 * 按距离显示帖子的列表（首页"附近的二手"、房屋页距离筛选共用）。原来写在
 * nearby-used-list.tsx 里只给二手用，房屋页要同一套"分页 + 分隔线 + 距离标签"，
 * 所以挪出来，用 props 区分卡片样式、排序和空状态文案。
 *
 * 范围内的排前面；看完范围内的，自动接着显示更远的，中间一条"以下距离超过
 * X 英里"；没填邮编的帖子排最后，前面一条"以下未标注位置"。卡片上显示距离。
 */
export function NearbyPostList({
  location,
  radiusMiles,
  categorySlugs,
  variant = "grid",
  newestFirstWithinRadius = false,
  searchQuery,
  emptyText,
  onPublishClick
}: NearbyPostListProps) {
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useNearbyPostsInfiniteQuery({
    latitude: location.latitude,
    longitude: location.longitude,
    categorySlugs,
    ...(newestFirstWithinRadius ? { radiusMiles } : {}),
    ...(searchQuery ? { searchQuery } : {})
  });

  const blockedUserIds = useBlockedUserIds();

  // 无限滚动：跟 PostList 一样用"哨兵元素 + IntersectionObserver"。
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isPending) {
    return (
      <div role="status">
        <span className="sr-only">加载中…</span>
        {variant === "wanted" ? (
          <div className="flex flex-col gap-3 px-4">
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <div key={index} className="rounded-card-lg border border-border bg-card-white p-4 shadow-card">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="mt-2 h-4 w-2/5" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-1 gap-y-3 px-1 pt-1">
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <div key={index}>
                <Skeleton className="aspect-square w-full rounded-[4px]" />
                <div className="mt-1 space-y-1 px-0.5">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="px-4 py-6 text-sm text-text-muted">
        加载失败，请稍后重试。
      </p>
    );
  }

  // 苹果审核 1.2 整改：被我屏蔽的用户发的帖子不显示。
  const items = data.pages.flatMap((page) => page.items).filter((item) => !blockedUserIds.has(item.post.authorId));

  if (items.length === 0) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-sm text-text-muted">{emptyText}</p>
        <button
          type="button"
          onClick={onPublishClick}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          去发布
        </button>
      </div>
    );
  }

  // 分隔线放在"第一条超出范围的"和"第一条没有距离的"前面（数据库已经按
  // 范围内 → 范围外 → 没邮编 排好）。
  const firstFarIndex = items.findIndex((item) => item.distanceMiles !== null && item.distanceMiles > radiusMiles);
  const firstUnknownIndex = items.findIndex((item) => item.distanceMiles === null);

  // 分隔线要横跨整行，所以按分隔线把列表切成几段，每段一个网格 / 一列卡片。
  const sections: Array<{ divider: string | null; items: typeof items }> = [];
  items.forEach((item, index) => {
    let divider: string | null = null;
    if (index === firstFarIndex) divider = `以下距离超过 ${radiusMiles} 英里`;
    else if (index === firstUnknownIndex) divider = "以下未标注位置";
    if (index === 0 || divider) sections.push({ divider, items: [] });
    sections[sections.length - 1]!.items.push(item);
  });

  return (
    <div>
      {sections.map((section, sectionIndex) => (
        <Fragment key={sectionIndex}>
          {section.divider ? (
            <div role="separator" className="flex items-center gap-3 px-4 py-3 text-xs text-text-subtle">
              <span className="h-px flex-1 bg-divider" />
              {section.divider}
              <span className="h-px flex-1 bg-divider" />
            </div>
          ) : null}
          {variant === "wanted" ? (
            <div className="flex flex-col gap-3 px-4">
              {section.items.map(({ post, distanceMiles }) => (
                <WantedPostCard
                  key={post.id}
                  post={post}
                  distanceLabel={distanceMiles === null ? undefined : formatDistanceMiles(distanceMiles)}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-1 gap-y-3 px-1 pt-1">
              {section.items.map(({ post, distanceMiles }) => (
                <PostGridCard
                  key={post.id}
                  post={post}
                  distanceLabel={distanceMiles === null ? undefined : formatDistanceMiles(distanceMiles)}
                />
              ))}
            </div>
          )}
        </Fragment>
      ))}
      {hasNextPage ? <div ref={sentinelRef} aria-hidden="true" /> : null}
      {isFetchingNextPage ? <p role="status" className="py-3 text-center text-sm text-text-muted">加载更多…</p> : null}
    </div>
  );
}

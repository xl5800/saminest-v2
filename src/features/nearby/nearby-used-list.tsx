import { Fragment, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Skeleton } from "../../components/skeleton";
import { CategoriesGate, NoPostsYet } from "../categories/categories-gate";
import { useNearbyPostsInfiniteQuery } from "../posts/use-nearby-posts-query";
import { PostGridCard, PostList } from "../posts/post-list";
import { useNearbyLocationStore, type NearbyLocation } from "../../store/nearby-location-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { formatDistanceMiles } from "../../utils/format-distance";

export const USED_CATEGORY_SLUG = "used";
const NEARBY_CATEGORY_SLUGS = [USED_CATEGORY_SLUG];
const SKELETON_COUNT = 4;

/**
 * 首页"附近的二手"任务卡：首页下方的二手列表。
 *
 * - 设了位置：按距离从近到远，范围内的排前面；看完范围内的，自动接着显示
 *   更远的，中间一条"以下距离超过 X 英里"；没填邮编的帖子排最后，前面一条
 *   "以下未标注位置"。卡片上显示距离。
 * - 没设位置：跟二手闲置页一样，按当前选中的州显示（复用 PostList）。
 */
export function NearbyUsedList() {
  const location = useNearbyLocationStore((s) => s.location);
  const radiusMiles = useNearbyLocationStore((s) => s.radiusMiles);

  if (!location) return <UsedByStateList />;
  return <NearbyList location={location} radiusMiles={radiusMiles} />;
}

function UsedByStateList() {
  const navigate = useNavigate();
  const stateCode = useSelectedRegionStore((s) => s.selectedRegion?.stateCode);
  return (
    <CategoriesGate>
      {(idBySlug) => {
        const categoryId = idBySlug.get(USED_CATEGORY_SLUG);
        if (!categoryId) return <NoPostsYet />;
        return (
          <PostList
            variant="grid"
            categoryId={categoryId}
            stateCode={stateCode}
            onPublishClick={() => navigate(`/publish?category=${USED_CATEGORY_SLUG}`)}
          />
        );
      }}
    </CategoriesGate>
  );
}

function NearbyList({ location, radiusMiles }: { location: NearbyLocation; radiusMiles: number }) {
  const navigate = useNavigate();
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useNearbyPostsInfiniteQuery({
    latitude: location.latitude,
    longitude: location.longitude,
    categorySlugs: NEARBY_CATEGORY_SLUGS
  });

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

  const items = data.pages.flatMap((page) => page.items);

  if (items.length === 0) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-sm text-text-muted">附近还没有二手，欢迎发布第一条</p>
        <button
          type="button"
          onClick={() => navigate(`/publish?category=${USED_CATEGORY_SLUG}`)}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          去发布
        </button>
      </div>
    );
  }

  // 分隔线放在"第一条超出范围的"和"第一条没有距离的"前面（列表已按距离排好）。
  const firstFarIndex = items.findIndex((item) => item.distanceMiles !== null && item.distanceMiles > radiusMiles);
  const firstUnknownIndex = items.findIndex((item) => item.distanceMiles === null);

  // 分隔线要横跨两列，所以按分隔线把列表切成几段，每段一个两列网格。
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
          <div className="grid grid-cols-2 gap-x-1 gap-y-3 px-1 pt-1">
            {section.items.map(({ post, distanceMiles }) => (
              <PostGridCard
                key={post.id}
                post={post}
                distanceLabel={distanceMiles === null ? undefined : formatDistanceMiles(distanceMiles)}
              />
            ))}
          </div>
        </Fragment>
      ))}
      {hasNextPage ? <div ref={sentinelRef} aria-hidden="true" /> : null}
      {isFetchingNextPage ? <p role="status" className="py-3 text-center text-sm text-text-muted">加载更多…</p> : null}
    </div>
  );
}

import { useNavigate } from "react-router-dom";

import { NEARBY_USED_ENABLED } from "../../config/feature-flags";
import { CategoriesGate, NoPostsYet } from "../categories/categories-gate";
import { PostList } from "../posts/post-list";
import { buildPublishPath } from "../posts/publish-path";
import { useNearbyLocationStore, type NearbyLocation } from "../../store/nearby-location-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { NearbyPostList } from "./nearby-post-list";

export const USED_CATEGORY_SLUG = "used";
const NEARBY_CATEGORY_SLUGS = [USED_CATEGORY_SLUG];
const USED_PUBLISH_PATH = buildPublishPath(USED_CATEGORY_SLUG, [USED_CATEGORY_SLUG]);

/**
 * 首页"附近的二手"任务卡：首页下方的二手列表。
 *
 * - 设了位置：按距离从近到远，范围内的排前面；看完范围内的，自动接着显示
 *   更远的，中间一条"以下距离超过 X 英里"；没填邮编的帖子排最后，前面一条
 *   "以下未标注位置"。卡片上显示距离。
 * - 没设位置，或者附近功能关着（NEARBY_USED_ENABLED）：跟二手闲置页一样，
 *   按当前选中的州显示（复用 PostList）。功能关着时，以前在这台手机上设过的
 *   位置也不用。
 */
export function NearbyUsedList() {
  const location = useNearbyLocationStore((s) => s.location);
  const radiusMiles = useNearbyLocationStore((s) => s.radiusMiles);

  if (!NEARBY_USED_ENABLED || !location) return <UsedByStateList />;
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
            onPublishClick={() => navigate(USED_PUBLISH_PATH)}
          />
        );
      }}
    </CategoriesGate>
  );
}

function NearbyList({ location, radiusMiles }: { location: NearbyLocation; radiusMiles: number }) {
  const navigate = useNavigate();
  return (
    <NearbyPostList
      location={location}
      radiusMiles={radiusMiles}
      categorySlugs={NEARBY_CATEGORY_SLUGS}
      emptyText="附近还没有二手闲置，欢迎发布第一条"
      onPublishClick={() => navigate(USED_PUBLISH_PATH)}
    />
  );
}

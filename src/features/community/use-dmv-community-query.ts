import { useQuery } from "@tanstack/react-query";

import { getCommunityBySlug } from "../../repositories/community-repository";

const DMV_COMMUNITY_SLUG = "dmv";

/** v1 唯一的社区，几乎不会变，staleTime 设成 Infinity 不重复请求。 */
export function useDmvCommunityQuery() {
  return useQuery({
    queryKey: ["community", DMV_COMMUNITY_SLUG],
    queryFn: () => getCommunityBySlug(DMV_COMMUNITY_SLUG),
    staleTime: Infinity
  });
}

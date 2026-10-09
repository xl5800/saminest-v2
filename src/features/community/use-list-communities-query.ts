import { useQuery } from "@tanstack/react-query";

import { listCommunities } from "../../repositories/community-repository";

/** 全部社区（社区浏览页"附近"/"发现"Tab）。社区列表几乎不变，吃全局默认缓存即可。 */
export function useListCommunitiesQuery() {
  return useQuery({
    queryKey: ["communities"],
    queryFn: listCommunities
  });
}

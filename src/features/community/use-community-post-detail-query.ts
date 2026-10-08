import { useQuery } from "@tanstack/react-query";

import { getCommunityPostDetail } from "../../repositories/community-repository";

export interface UseCommunityPostDetailQueryOptions {
  // 编辑模式的发帖页复用这个 hook，新建模式下 id 是空字符串，不能真的拿空
  // id 去查——跟 usePostDetailQuery 的 enabled 选项同一个用法。默认 true，
  // 详情页调用点不用改。
  enabled?: boolean;
}

export function useCommunityPostDetailQuery(
  id: string,
  options: UseCommunityPostDetailQueryOptions = {}
) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ["community-post-detail", id],
    queryFn: () => getCommunityPostDetail(id),
    enabled
  });
}

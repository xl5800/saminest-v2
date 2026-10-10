import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adminArchiveCommunityPost } from "../../repositories/admin-repository";
import type { AdminCommunityPostListItem } from "../../repositories/community-repository";
import { ADMIN_COMMUNITY_POSTS_QUERY_KEY } from "./use-admin-community-posts-query";

export interface AdminArchiveCommunityPostInput {
  communityPostId: string;
  archiveNote: string;
}

/**
 * 管理员下架社区帖子。跟 use-admin-archive-post-mutation.ts 同一个思路：下架后
 * 行仍然留在管理列表里，只把缓存里那一行的 status 改成 archived（按钮随之禁用）。
 * 同时失效前台的社区帖子缓存（首页 / 社区页 / 搜索 / 详情），下架的帖子不该
 * 再出现在那里。
 */
export function useAdminArchiveCommunityPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminArchiveCommunityPostInput) =>
      adminArchiveCommunityPost(input.communityPostId, input.archiveNote),
    onSuccess: (_data, variables) => {
      queryClient.setQueriesData<AdminCommunityPostListItem[]>(
        { queryKey: ADMIN_COMMUNITY_POSTS_QUERY_KEY },
        (old) =>
          old?.map((post) =>
            post.id === variables.communityPostId ? { ...post, status: "archived" } : post
          )
      );
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      void queryClient.invalidateQueries({
        queryKey: ["community-post-detail", variables.communityPostId]
      });
    }
  });
}

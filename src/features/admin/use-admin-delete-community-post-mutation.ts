import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adminDeleteCommunityPost } from "../../repositories/admin-repository";
import type { AdminCommunityPostListItem } from "../../repositories/community-repository";
import { ADMIN_COMMUNITY_POSTS_QUERY_KEY } from "./use-admin-community-posts-query";

export interface AdminDeleteCommunityPostInput {
  communityPostId: string;
  deleteReason: string;
}

/**
 * 管理员删除社区帖子。跟 use-delete-post-mutation.ts 一样，成功后直接把这一行
 * 从管理列表缓存里过滤掉；同时失效前台社区帖子缓存。
 */
export function useAdminDeleteCommunityPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminDeleteCommunityPostInput) =>
      adminDeleteCommunityPost(input.communityPostId, input.deleteReason),
    onSuccess: (_data, variables) => {
      queryClient.setQueriesData<AdminCommunityPostListItem[]>(
        { queryKey: ADMIN_COMMUNITY_POSTS_QUERY_KEY },
        (old) => old?.filter((post) => post.id !== variables.communityPostId)
      );
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      void queryClient.invalidateQueries({
        queryKey: ["community-post-detail", variables.communityPostId]
      });
    }
  });
}

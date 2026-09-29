import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adminArchivePost } from "../../repositories/admin-repository";
import type { AdminPostListItem } from "../../repositories/posts-repository";

export interface AdminArchivePostMutationInput {
  postId: string;
  archiveNote: string;
}

/**
 * 管理员下架一个帖子（把 status 改成 archived + 写 archive_reason，走
 * admin_archive_post RPC，见
 * supabase/migrations/20260929000000_admin_archive_post_function.sql）。
 * 功能改动清单第 7 项：原版帖子只有删除，这里新增「下架」。
 *
 * 命名/结构跟 use-admin-cancel-activity-mutation.ts（活动那边同样的
 * "下架不等于删除"模式）是同一个思路：成功后不把这一行从缓存里删掉，而是
 * 直接把 react-query 缓存里 ["admin","all-posts",...] 对应那一行的
 * status/archiveReason 更新掉——下架之后行还要留在「全部帖子」管理列表里
 * （README 管理后台小节："新增「下架」...状态变「已下架」，行保留"），
 * 跟 use-delete-post-mutation.ts 整行过滤掉是不一样的更新方式。
 */
export function useAdminArchivePostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminArchivePostMutationInput) =>
      adminArchivePost(input.postId, input.archiveNote),
    onSuccess: (_data, variables) => {
      queryClient.setQueriesData<AdminPostListItem[]>(
        { queryKey: ["admin", "all-posts"] },
        (old) =>
          old?.map((post) =>
            post.id === variables.postId
              ? { ...post, status: "archived", archiveReason: variables.archiveNote }
              : post
          )
      );
    }
  });
}

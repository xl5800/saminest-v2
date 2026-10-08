import { useMutation } from "@tanstack/react-query";

import { adminDeleteCommunityPost } from "../../repositories/admin-repository";

export interface AdminDeleteCommunityPostMutationInput {
  postId: string;
  deleteReason: string;
}

/**
 * 管理员强制删除一个社区帖子（走 admin_delete_community_post RPC）。跟
 * use-delete-post-mutation.ts 不一样的是这里没有一个"全部社区帖子"管理
 * 列表页的缓存需要同步更新（这次任务范围里没有新建这样一个列表页，社区
 * 功能阶段七任务卡背景部分有说明），所以不需要 onSuccess 里手动改
 * react-query 缓存——reports-page.tsx 自己维护一份独立的本地 reports 列表，
 * 处理成功后会自己把这一行移除，不依赖这个 mutation 的缓存副作用。如果这条
 * 社区帖子当前正在被谁的 community-post-detail 查询缓存着，交给 TanStack
 * Query 默认的 refetch-on-mount 行为去处理即可，不需要在这里主动
 * invalidate。
 */
export function useAdminDeleteCommunityPostMutation() {
  return useMutation({
    mutationFn: (input: AdminDeleteCommunityPostMutationInput) =>
      adminDeleteCommunityPost(input.postId, input.deleteReason)
  });
}

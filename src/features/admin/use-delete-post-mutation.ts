import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deletePost } from "../../repositories/admin-repository";
import type { AdminPostListItem } from "../../repositories/posts-repository";

export interface DeletePostMutationInput {
  postId: string;
  deleteReason: string;
}

/**
 * 删除一个帖子（软删除，走 delete_post RPC）。成功后直接更新 react-query
 * 缓存里"全部帖子"管理列表（["admin","all-posts",...]，见
 * use-all-posts-query.ts）的数据，把这一行从缓存的数组里过滤掉，而不是
 * 像早期版本那样让调用方自己在组件里维护一份独立的本地列表副本。
 *
 * 早期版本的问题：本地列表一旦被"删掉一行"这么改过（哪怕删空成 []）就
 * 不再是初始的 null，all-posts-page.tsx 里"只在本地列表是 null 时才从
 * 查询结果同步"这个守卫条件从此再也不会成立——不管后面切换筛选条件、
 * 切页面来回、还是数据库里真的有了新内容，这份本地列表都不会再更新，这
 * 正是"删除之后再切一次页面，列表显示空白"那个 bug 的根因。现在改成
 * 直接改 react-query 自己的缓存（唯一数据源，不存在第二份可能过期的
 * 副本），两个调用方（all-posts-page.tsx / reports-page.tsx）都不用再
 * 各自维护本地列表状态；用不带 status/category/search 具体值的前缀 key
 * 匹配，一次性更新到所有筛选条件下的缓存条目。不需要额外再
 * invalidateQueries——这里改的就是 useAllPostsQuery 本身读的那份缓存，
 * 不是另一份副本，其它页面（比如待审核队列）批准/驳回帖子导致这份缓存
 * 过期时，也自然会被 react-query 默认的 refetch-on-mount 行为刷新，不
 * 依赖这个 mutation 主动失效。
 */
export function useDeletePostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeletePostMutationInput) =>
      deletePost(input.postId, input.deleteReason),
    onSuccess: (_data, variables) => {
      queryClient.setQueriesData<AdminPostListItem[]>(
        { queryKey: ["admin", "all-posts"] },
        (old) => old?.filter((post) => post.id !== variables.postId)
      );
    }
  });
}

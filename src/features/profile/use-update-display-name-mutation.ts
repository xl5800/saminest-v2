import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateMyDisplayName } from "../../repositories/profiles-repository";

export interface UpdateDisplayNameMutationInput {
  userId: string;
  displayName: string;
}

/**
 * 编辑昵称页面（/profile/edit）用。成功后用 invalidateQueries 让
 * useMyProfileQuery（queryKey ["my-profile", userId]）重新拉取最新值，
 * 不用 setQueryData 直接写入——这个 mutation 本身只知道"改成了什么昵称"，
 * setQueryData 需要在这里手动拼出完整的 MyProfile 形状（还要带上没有
 * 变化的 avatarUrl），容易在 MyProfile 以后加字段时漏更新；
 * invalidateQueries 让 useMyProfileQuery 用同一份 getMyProfile 查询逻辑
 * 重新拉一次，权威数据始终来自后端，这里不需要维护第二份"更新后应该长
 * 什么样"的逻辑。
 */
export function useUpdateDisplayNameMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateDisplayNameMutationInput) =>
      updateMyDisplayName(input.userId, input.displayName),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["my-profile", variables.userId]
      });
    }
  });
}

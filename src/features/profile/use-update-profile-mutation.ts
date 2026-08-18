import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateMyProfile } from "../../repositories/profiles-repository";

export interface UpdateProfileMutationInput {
  userId: string;
  displayName: string;
  bio: string | null;
  locationId: string | null;
}

/**
 * 编辑资料页面（/profile/edit）用，取代了原来只改昵称一列的
 * use-update-display-name-mutation.ts——这个 hook 之前只有编辑资料页这一个
 * 调用方，继续保留一个单字段版本会变成没有其它调用方在用的重复代码，见
 * profiles-repository.ts 里 updateMyProfile 的注释。
 *
 * 成功后用 invalidateQueries 让 useMyProfileQuery（queryKey
 * ["my-profile", userId]）重新拉取最新值，不用 setQueryData 直接写入——
 * 这个 mutation 本身只知道"改成了什么"，setQueryData 需要在这里手动拼出
 * 完整的 MyProfile 形状（还要带上没有变化的 avatarUrl/locationName），
 * 容易在 MyProfile 以后加字段时漏更新；invalidateQueries 让
 * useMyProfileQuery 用同一份 getMyProfile 查询逻辑重新拉一次，权威数据
 * 始终来自后端，这里不需要维护第二份"更新后应该长什么样"的逻辑。
 */
export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileMutationInput) =>
      updateMyProfile(input.userId, {
        displayName: input.displayName,
        bio: input.bio,
        locationId: input.locationId
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["my-profile", variables.userId]
      });
    }
  });
}

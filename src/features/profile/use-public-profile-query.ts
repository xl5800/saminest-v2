import { useQuery } from "@tanstack/react-query";

import { getPublicProfile, type PublicProfile } from "../../repositories/profiles-repository";

/**
 * 公开个人主页（/users/:userId，不用 RequireAuth 包裹，游客也能看）用。
 * queryKey 按 userId 区分，跟 useMyProfileQuery（["my-profile", userId]，
 * 只查当前登录用户自己）是两个独立的缓存条目，不共用同一个 key——即使
 * 是查看自己的公开主页，也应该走这条公开查询的缓存，不该跟"我的"页面的
 * 私有查询混在一起。
 */
export function usePublicProfileQuery(userId: string) {
  return useQuery<PublicProfile | null>({
    queryKey: ["public-profile", userId],
    queryFn: () => getPublicProfile(userId),
    enabled: !!userId
  });
}

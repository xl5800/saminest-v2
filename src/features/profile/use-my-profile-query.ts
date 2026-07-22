import { useQuery } from "@tanstack/react-query";

import { getMyProfile, type MyProfile } from "../../repositories/profiles-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 当前登录用户自己的 profile（display_name + avatar_url），供 /profile 页面
 * 展示用。没有登录用户时禁用查询——这个 hook 只会在 /profile 页面使用，
 * 而该路由已经被 RequireAuth 包裹，这里的 enabled 只是防御性的，不承担
 * 鉴权职责。
 */
export function useMyProfileQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<MyProfile | null>({
    queryKey: ["my-profile", userId],
    queryFn: () => getMyProfile(userId as string),
    enabled: !!userId
  });
}

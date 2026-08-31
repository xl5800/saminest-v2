import { useQuery } from "@tanstack/react-query";

import { getMyProfile, type MyProfile } from "../../repositories/profiles-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 当前登录用户自己的 profile（display_name + avatar_url）。最初只给
 * /profile 页面展示用；28 号卡（私信消息气泡头像）起 conversation-page.tsx
 * 也复用同一个 hook 拿"我方发送的消息"气泡旁边的头像——两个调用点都在
 * RequireAuth 包裹的路由下，enabled 判断只是防御性的，不承担鉴权职责。
 */
export function useMyProfileQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<MyProfile | null>({
    queryKey: ["my-profile", userId],
    queryFn: () => getMyProfile(userId as string),
    enabled: !!userId
  });
}

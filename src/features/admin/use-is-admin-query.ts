import { useQuery } from "@tanstack/react-query";

import { getCurrentUserRole } from "../../repositories/profiles-repository";
import { useAuthStore } from "../../store/auth-store";

// 跟数据库 is_admin() 函数判断的取值完全一致（admin/super_admin 两个角色），
// 不要在这里自己发明一份不同的角色列表。
const ADMIN_ROLES = new Set(["admin", "super_admin"]);

/**
 * 当前登录用户是否是管理员，供 RequireAdmin 路由守卫使用。没有登录用户时
 * 禁用查询（这种情况应该已经被外层的 RequireAuth 挡住，这里只是防御性的）。
 */
export function useIsAdminQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<boolean>({
    queryKey: ["current-user-role", userId],
    queryFn: async () => {
      const role = await getCurrentUserRole(userId as string);
      return role !== null && ADMIN_ROLES.has(role);
    },
    enabled: !!userId
  });
}

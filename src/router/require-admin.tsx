import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";

import { useIsAdminQuery } from "../features/admin/use-is-admin-query";

/**
 * 管理员权限守卫，设计为嵌套在 RequireAuth 内部使用（<RequireAuth><RequireAdmin>
 * ...），而不是 RequireAuth 的一个参数化变体：
 * - "有没有登录"和"是不是管理员"是两个不同的关注点，失败后的跳转目标也不同
 *   （没登录 -> /login；登录了但不是管理员 -> /，不是 /login）。
 * - 判断是不是管理员需要异步查 profiles.role，这是数据请求，不应该污染
 *   RequireAuth 现在同步、零请求的实现。
 * - 组合方式让两个守卫各自职责单一，也方便分别测试。
 *
 * 查询状态处理：
 * - pending（含未登录导致的 disabled 状态）：显示加载中，不提前跳转，
 *   避免在数据还没回来时把真正的管理员错误跳出去。
 * - 不是 true（包括"确认不是管理员"和"查询失败"两种情况）：一律跳转到
 *   "/"，失败也当作"不是管理员"处理（fail closed，不能因为查询出错就放行）。
 * - 只有明确拿到 true 才渲染 children。
 */
export function RequireAdmin({
  children
}: {
  children: ReactElement;
}): ReactElement {
  const { data: isAdmin, isPending } = useIsAdminQuery();

  if (isPending) {
    return <p role="status">加载中…</p>;
  }

  if (isAdmin !== true) {
    return <Navigate to="/" replace />;
  }

  return children;
}

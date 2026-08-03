import type { Session } from "@supabase/supabase-js";
import { useEffect } from "react";

import { getSupabaseClient } from "../integrations/supabase/client";
import { ensureProfileExists } from "../repositories/profiles-repository";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";

const DEFAULT_DISPLAY_NAME = "新用户";

/**
 * 开发环境下把"补建 profile"失败的真实错误打印出来，跟 publish-page.tsx
 * 的 logDevImageError 是同一个模式：生产环境不打印（避免把内部错误细节
 * 暴露给普通用户能打开的浏览器控制台），只在 import.meta.env.DEV 下生效。
 */
function logDevProfileBootstrapError(error: unknown): void {
  if (!import.meta.env.DEV) return;
  if (error instanceof AppError) {
    console.error("[auth-bootstrap] 补建 profile 失败", {
      code: error.code,
      message: error.message,
      cause: error.cause
    });
    return;
  }
  console.error("[auth-bootstrap] 补建 profile 失败", error);
}

/**
 * 邮箱验证开启时，authService.signUp() 阶段 session 是 null，profile 不会
 * 被创建（见 auth-service.ts signUp() 里调用 createProfile 那一段的注释）
 * ——用户完成邮箱验证、真正登录进来、这里拿到一个新的有效 session 时，
 * 兜底检查一下 profiles 表里有没有这个用户的记录，没有就补建。
 *
 * displayName 从 session.user.user_metadata.display_name 读（signUp 时
 * 通过 options.data.display_name 存的那个，跟 createProfile 用的是同一个
 * 来源）；理论上不应该发生、但防御性处理一下：不是字符串或者是空白时不
 * 传空字符串下去，交给 ensureProfileExists/createProfile 自己的默认值
 * 兜底。
 *
 * 补建失败（网络问题、极端情况下的竞态等）不能卡住登录/启动流程——这里
 * 只记一下开发环境日志，不 setError、不阻塞任何渲染，页面该怎么正常
 * 渲染还是怎么渲染。真正因为缺 profile 行导致的功能性失败（发帖/收藏/
 * 联系作者）留给那些功能自己的错误处理去展示，这里不重复处理。
 */
async function ensureProfileForSession(session: Session): Promise<void> {
  const metadataDisplayName = session.user.user_metadata?.display_name;
  const displayName =
    typeof metadataDisplayName === "string" && metadataDisplayName.trim()
      ? metadataDisplayName
      : DEFAULT_DISPLAY_NAME;

  try {
    await ensureProfileExists(session.user.id, displayName);
  } catch (error) {
    logDevProfileBootstrapError(error);
  }
}

/**
 * Reads the current session once, then keeps the auth store in sync via a
 * single onAuthStateChange subscription for the lifetime of the app.
 *
 * 每次拿到一个新的有效 session（session 从没有变成有，或者 session 对应
 * 的用户 id 变了）时，顺带触发一次 ensureProfileForSession——只在这种
 * 转变发生时检查，不在同一个已登录用户的每次 onAuthStateChange 触发
 * （比如 token 静默刷新）上都重新查一遍 profiles 表。lastCheckedUserId
 * 是这个 effect 闭包里的普通变量，不是 React state，用它来记录"已经检查
 * 过哪个用户"不需要触发额外的重新渲染。
 */
export function useAuthBootstrap(): void {
  useEffect(() => {
    const supabase = getSupabaseClient();
    const { setSession, setInitializing } = useAuthStore.getState();
    let lastCheckedUserId: string | null = null;

    function handleSession(session: Session | null): void {
      setSession(session);

      // session.user 理论上总是存在（真实的 Supabase Session 保证这一点），
      // 但防御性处理一下非法/不完整的 session 形状，不让这里因为读
      // session.user.id 直接抛出去，把整个登录态初始化流程带崩。
      const userId = session?.user?.id;
      if (!session || !userId) {
        lastCheckedUserId = null;
        return;
      }
      if (userId !== lastCheckedUserId) {
        lastCheckedUserId = userId;
        void ensureProfileForSession(session);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      handleSession(data.session);
      setInitializing(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
}

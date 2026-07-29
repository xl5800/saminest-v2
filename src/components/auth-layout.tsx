import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

export const authLabelClassName = "block text-sm font-medium text-text";

export const authInputClassName =
  "mt-1 h-11 w-full rounded-xl border border-border px-3 text-base text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export const authSubmitButtonClassName =
  "h-11 w-full rounded-xl bg-primary font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60";

export interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * 登录/注册/忘记密码/重置密码四个认证页面共用的外层布局：精简版顶部栏
 * （返回按钮 + 居中 "Saminest" 文字），不复用全局 AppHeader——AppHeader
 * 是给已登录/浏览场景用的完整导航栏（发布按钮、收藏/消息/我的），认证
 * 页面不需要这些入口，硬塞进来只会让登录/注册流程显得不像专门设计过的。
 *
 * 返回按钮沿用 AppHeader 现成的 navigate(-1) 写法，不重新设计交互；
 * AppShell 那边已经把这四条路径当成"沉浸式页面"处理，不会重复渲染
 * 全局 AppHeader/BottomNav，这里不需要再处理"隐藏底部导航"。
 *
 * 内容区不做垂直居中，从顶部往下走——避免在小屏上大片留白，让 iPhone
 * Safari 一屏内能看到从标题到提交按钮的完整登录/注册操作。
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate(-1)}
          className="shrink-0 text-lg text-text"
        >
          ←
        </button>
        <Link to="/" className="flex-1 text-center text-lg font-bold text-primary">
          Saminest
        </Link>
        <span aria-hidden="true" className="w-6 shrink-0" />
      </header>
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

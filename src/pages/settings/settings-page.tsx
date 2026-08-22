import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * "设置"页面（/settings），是"我的"页顶部右侧设置齿轮此前留的占位路径
 * （见 profile-page.tsx 里 SETTINGS_PATH 顶部的注释）——这次任务范围只是
 * 补上"注销账号"这一项功能，不借机把设置页扩成一个完整的设置中心（比如
 * 通知偏好、语言、隐私政策快捷入口等都不在这次任务范围内，PrivacyPage/
 * TermsPage 目前各自有独立入口，不需要在这里重复收纳）。
 *
 * 路由已在 routes.tsx 用 RequireAuth 包裹，页面内部不做登录检查/跳转，
 * 符合 CLAUDE.md 的统一规则。没有用 TopBar（这个路由不在
 * app-shell.tsx 的 TOPBAR_MIGRATED_PATTERNS 里），沿用默认的全局
 * AppHeader——非首页路径会自动带"←"返回按钮，不需要专门为这一个页面
 * 再实现一次返回逻辑，跟 edit-profile-page.tsx / report-post-page.tsx
 * 是同一个模式。
 */
export function SettingsPage() {
  return (
    <main className="min-h-screen pb-20 md:pb-6">
      <div className="mx-auto max-w-md px-4 py-6">
        <h1 className="mb-6 text-xl font-bold text-text">设置</h1>

        <section aria-label="账号与安全">
          <h2 className="mb-2 text-sm font-medium text-text-muted">账号与安全</h2>
          <Link
            to="/settings/delete-account"
            className="flex h-14 items-center justify-between rounded-2xl bg-white px-4 text-base font-medium text-danger shadow-settings-item transition-opacity hover:opacity-90"
          >
            <span>注销账号</span>
            <ChevronRight aria-hidden="true" size={18} className="text-chevron" />
          </Link>
        </section>
      </div>
    </main>
  );
}

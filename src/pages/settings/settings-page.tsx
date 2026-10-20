import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { useContactSupport } from "../../features/conversations/use-contact-support";

/**
 * "设置"页面（/settings），是"我的"页顶部右侧设置齿轮此前留的占位路径
 * （见 profile-page.tsx 里 SETTINGS_PATH 顶部的注释）——这次任务范围只是
 * 补上"注销账号"这一项功能，不借机把设置页扩成一个完整的设置中心（比如
 * 通知偏好、语言、隐私政策快捷入口等都不在这次任务范围内，PrivacyPage/
 * TermsPage 目前各自有独立入口，不需要在这里重复收纳）。
 *
 * 路由已在 routes.tsx 用 RequireAuth 包裹，页面内部不做登录检查/跳转，
 * 符合 CLAUDE.md 的统一规则。26 号卡（18 条旧 AppHeader 路由统一迁移到
 * TopBar）：改用 TopBar 的 nav-only 变体（带 title="设置"，不带品牌名/
 * 发布按钮），这个路由也随之加进了 app-shell.tsx 的
 * TOPBAR_MIGRATED_PATTERNS——之前这里沿用的是默认全局 AppHeader，这次连
 * 品牌名+发布按钮一起去掉，只保留返回。
 */
export function SettingsPage() {
  const { contactSupport, error: contactSupportError } = useContactSupport();

  return (
    <main className="min-h-screen pb-20 md:pb-6">
      <TopBar variant="nav-only" title="设置" />
      <div className="mx-auto max-w-md px-4 py-6">
        <section aria-label="账号与安全">
          <h2 className="mb-2 text-sm font-medium text-text-muted">账号与安全</h2>
          {/* 短信验证码登录任务卡：设过登录密码之后，可以用手机号 + 密码登录。 */}
          <Link
            to="/settings/password"
            className="mb-3 flex h-14 items-center justify-between rounded-2xl border border-border bg-card px-4 text-base font-medium text-text shadow-settings-item transition-opacity hover:opacity-90"
          >
            <span>登录密码</span>
            <ChevronRight aria-hidden="true" size={18} className="text-chevron" />
          </Link>
          <Link
            to="/settings/delete-account"
            className="flex h-14 items-center justify-between rounded-2xl border border-border bg-card px-4 text-base font-medium text-danger shadow-settings-item transition-opacity hover:opacity-90"
          >
            <span>注销账号</span>
            <ChevronRight aria-hidden="true" size={18} className="text-chevron" />
          </Link>
        </section>

        {/* 苹果审核 1.2 整改：App 内要有能举报不当行为的联系方式。复用"我的"页的
            "帮助与客服"（站内客服对话），不另外放邮箱。 */}
        <section aria-label="帮助与举报" className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-text-muted">帮助与举报</h2>
          <button
            type="button"
            onClick={contactSupport}
            className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left text-base font-medium text-text shadow-settings-item transition-opacity hover:opacity-90"
          >
            <span>
              帮助与客服
              <span className="mt-0.5 block text-xs font-normal text-text-muted">举报不当内容或滥用行为，我们会在 24 小时内处理</span>
            </span>
            <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-chevron" />
          </button>
          {contactSupportError ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {contactSupportError}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

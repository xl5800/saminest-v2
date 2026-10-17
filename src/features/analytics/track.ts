import { Capacitor } from "@capacitor/core";
import type { PostHog } from "posthog-js";

import { useAuthStore } from "../../store/auth-store";

/**
 * 数据分析任务卡：全站唯一的埋点入口（PostHog）。页面和 hooks 只调用这里的
 * track()，不直接 import posthog-js——以后换分析工具只改这一个文件。
 *
 * 只在正式环境发数据：生产构建（import.meta.env.PROD）并且运行在
 * saminest.com 域名或 Capacitor App 里。本地开发、跑测试、Vercel 预览部署
 * （*.vercel.app）都不发，免得把真实数据弄脏。
 *
 * 隐私：
 * - 关掉自动采集（autocapture）、热力图、录屏、性能数据，只记下面
 *   AnalyticsEvent 里明确列出的事件；
 * - 用户只用 Supabase 用户 ID 识别，不传手机号、邮箱、昵称；没登录的游客用
 *   PostHog 自动生成的匿名 ID，登录后 identify 把两者关联成同一个人；
 * - person_profiles: "identified_only"：游客不建用户档案，只有登录用户才有。
 *
 * posthog-js 用动态 import 加载，不进首屏包；加载完成前调用的 track() 先排队，
 * 加载好以后按顺序补发。
 */
const POSTHOG_PROJECT_KEY = "phc_vVj597Hnj6rrAXwZ2NZbgeRJxbmtGoYX6WHwMsQua7xz";
const POSTHOG_API_HOST = "https://us.i.posthog.com";
const PRODUCTION_HOSTNAMES = ["saminest.com", "www.saminest.com"];

/** 分享链接带的 ?s= 时间戳参数，见 features/share/community-share-input.ts。 */
const SHARE_LINK_PARAM = "s";

export type ContentType = "community_post" | "classified" | "activity";

export type AnalyticsEvent =
  | { name: "app_opened"; props: { from_share_link: boolean } }
  | { name: "signed_up"; props: { method: "email" | "phone" } }
  | { name: "logged_in"; props: { method: "email" | "phone" } }
  | { name: "content_viewed"; props: { type: ContentType } }
  | { name: "contact_started"; props: { type: "classified" | "activity" | "profile" } }
  | { name: "content_created"; props: { type: ContentType } }
  | { name: "community_joined"; props: Record<string, never> }
  | { name: "activity_joined"; props: Record<string, never> }
  | { name: "content_liked"; props: { type: "community_post" } }
  | { name: "content_favorited"; props: { type: ContentType } }
  | { name: "comment_created"; props: { type: ContentType } }
  | { name: "share_clicked"; props: { type: ContentType | "community" } };

type QueuedCall = (posthog: PostHog) => void;

let client: PostHog | null = null;
let queue: QueuedCall[] | null = null;

export function isAnalyticsEnabled(): boolean {
  if (!import.meta.env.PROD || import.meta.env.MODE === "test") return false;
  if (Capacitor.isNativePlatform()) return true;
  return typeof window !== "undefined" && PRODUCTION_HOSTNAMES.includes(window.location.hostname);
}

function run(call: QueuedCall): void {
  if (client) {
    call(client);
    return;
  }
  queue?.push(call);
}

/** 记录一个事件。分析没开启（本地/测试/预览）时什么都不做；永远不抛错。 */
export function track<E extends AnalyticsEvent>(name: E["name"], props: E["props"]): void {
  run((posthog) => {
    posthog.capture(name, { ...props, platform: Capacitor.getPlatform() });
  });
}

/**
 * App 启动时调用一次（main.tsx）。加载 posthog-js、记一次 app_opened，并跟着
 * 登录状态 identify / reset。
 */
export function initAnalytics(): void {
  if (!isAnalyticsEnabled() || queue) return;
  queue = [];

  const fromShareLink = new URLSearchParams(window.location.search).has(SHARE_LINK_PARAM);
  track("app_opened", { from_share_link: fromShareLink });

  let identifiedUserId: string | null = null;
  const syncIdentity = (userId: string | null) => {
    if (userId === identifiedUserId) return;
    const previous = identifiedUserId;
    identifiedUserId = userId;
    run((posthog) => {
      if (userId) posthog.identify(userId);
      // 退出登录：换一个新的匿名 ID，下一个在这台设备上登录的人不会跟上一个人
      // 混成同一个用户。
      else if (previous) posthog.reset();
    });
  };
  syncIdentity(useAuthStore.getState().session?.user.id ?? null);
  useAuthStore.subscribe((state) => syncIdentity(state.session?.user.id ?? null));

  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_PROJECT_KEY, {
        api_host: POSTHOG_API_HOST,
        // 单页应用：每次路由切换记一次页面浏览，Web Analytics 用。
        capture_pageview: "history_change",
        capture_pageleave: true,
        autocapture: false,
        capture_heatmaps: false,
        capture_dead_clicks: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        person_profiles: "identified_only"
      });
      client = posthog;
      const pending = queue ?? [];
      queue = [];
      for (const call of pending) call(posthog);
    })
    .catch((error: unknown) => {
      // 分析工具加载失败（被广告拦截插件挡掉之类）不影响 App 本身。
      console.warn("analytics unavailable:", error);
      queue = null;
    });
}

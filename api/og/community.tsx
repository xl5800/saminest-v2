import { ImageResponse } from "@vercel/og";
import React from "react";

/**
 * 社区分享卡片任务卡：社区帖子（没有照片时）和社区主页的分享方图。
 *
 *   /api/og/community?type=post&id=<帖子 id>&v=<更新时间>
 *   /api/og/community?type=community&slug=<社区 slug>&v=<更新时间>
 *
 * 版式跟 api/og/activity.tsx 的方图一样（600×600 渐变背景 + 半透明圆底大
 * 图标 + 白色胶囊标签），品牌蓝底色：帖子是 💬，社区主页是 👥，胶囊里写
 * 社区名。帖子标题、作者、评论数都在微信卡片左边的文字里（middleware.ts
 * 注入的 og:title / og:description），图上不重复。
 *
 * 为什么 SquareCard 和 loadFontSubset 是从 activity.tsx 复制过来而不是
 * import：两个文件各自是独立的 Vercel Edge Function，activity.tsx 顶部注释
 * 记录过——独立入口之间共用源文件会被打进共享 chunk，曾经导致 middleware
 * 部署失败。为了不再踩这个坑，这里各自维护一份；以后改方图版式需要两处
 * 一起改。
 *
 * 社区名不从参数里直接拿，而是按 id/slug 查一次库（走 anon 角色，受 RLS
 * 约束）：否则任何人拼一个参数就能用我们的域名生成写着任意文字的图片。
 * 查不到（不存在/已删除/未审核/社区未开放）一律画通用兜底卡。
 */
export const config = {
  runtime: "edge"
};

const CARD_SIZE = 600;

const BRAND_BLUE = {
  light: "#4A72F0",
  base: "#2F5BE8",
  dark: "#1E3FAE"
};

const FALLBACK_BADGE = "华邻社区";

/** 胶囊最多放这么多个字，超出截断加省略号（社区名一般很短，这里只是兜底）。 */
const BADGE_MAX_CHARS = 9;

function formatBadge(name: string): string {
  const chars = [...name.trim()];
  return chars.length > BADGE_MAX_CHARS ? `${chars.slice(0, BADGE_MAX_CHARS).join("")}…` : chars.join("");
}

function SquareCard({ emoji, badge }: { emoji: string; badge: string }) {
  return (
    <div
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: `radial-gradient(circle at 70% 25%, ${BRAND_BLUE.light} 0%, ${BRAND_BLUE.base} 45%, ${BRAND_BLUE.dark} 100%)`
      }}
    >
      <div
        style={{
          width: 330,
          height: 330,
          borderRadius: 9999,
          background: "rgba(255,255,255,0.16)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 220,
          lineHeight: 1
        }}
      >
        {emoji}
      </div>
      <div
        style={{
          marginTop: 34,
          maxWidth: 520,
          background: "#FFFFFF",
          color: BRAND_BLUE.dark,
          fontSize: 46,
          fontWeight: 700,
          padding: "10px 40px",
          borderRadius: 9999
        }}
      >
        {badge}
      </div>
    </div>
  );
}

/** 同 activity.tsx：只向 Google Fonts 要卡片上实际出现的字符的子集。 */
async function loadFontSubset(text: string): Promise<ArrayBuffer | null> {
  const uniqueChars = [...new Set(text)].join("");
  if (!uniqueChars) return null;

  try {
    const cssUrl = new URL("https://fonts.googleapis.com/css2");
    cssUrl.searchParams.set("family", "Noto Sans SC:wght@700");
    cssUrl.searchParams.set("text", uniqueChars);
    cssUrl.searchParams.set("display", "swap");

    const cssResponse = await fetch(cssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    if (!cssResponse.ok) return null;

    const css = await cssResponse.text();
    const fontUrl = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
    if (!fontUrl) return null;

    const fontResponse = await fetch(fontUrl);
    if (!fontResponse.ok) return null;

    return await fontResponse.arrayBuffer();
  } catch {
    return null;
  }
}

async function renderCard(emoji: string, badge: string): Promise<ImageResponse> {
  const fontData = await loadFontSubset(badge);
  return new ImageResponse(<SquareCard emoji={emoji} badge={badge} />, {
    width: CARD_SIZE,
    height: CARD_SIZE,
    fonts: fontData ? [{ name: "Noto Sans SC", data: fontData, weight: 700, style: "normal" }] : []
  });
}

async function fetchFirstRow<T>(restUrl: string, supabaseAnonKey: string): Promise<T | null> {
  try {
    const response = await fetch(restUrl, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as T[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return renderCard("💬", FALLBACK_BADGE);

  if (type === "community") {
    const slug = url.searchParams.get("slug");
    const row = slug
      ? await fetchFirstRow<{ name: string }>(
          `${supabaseUrl}/rest/v1/communities?slug=eq.${encodeURIComponent(slug)}&select=name`,
          supabaseAnonKey
        )
      : null;
    return renderCard("👥", row ? formatBadge(row.name) : FALLBACK_BADGE);
  }

  const id = url.searchParams.get("id");
  const row = id
    ? await fetchFirstRow<{ community: { name: string } | null }>(
        `${supabaseUrl}/rest/v1/community_posts?id=eq.${encodeURIComponent(id)}&select=community:communities(name)`,
        supabaseAnonKey
      )
    : null;
  return renderCard("💬", row?.community ? formatBadge(row.community.name) : FALLBACK_BADGE);
}

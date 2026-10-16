import { ImageResponse } from "@vercel/og";
import React from "react";

/**
 * 找搭子活动分享卡片任务卡：这个文件跟 middleware.ts 一样是独立的 Vercel
 * Edge Function，不经过 Vite 打包（Vercel 自己的 esbuild 流水线）。
 *
 * 这里之前直接 import 过 ../../src/utils/format.ts 和
 * ../../src/data/us-states.ts——理由是"两个都是零 import 的纯函数文件，
 * 不会拉进 Vite 专属链路"，这个判断本身没错（两个文件确实零 import），
 * 但实测部署到 Vercel 后仍然失败：`middleware.ts` 也 import 了同样这两个
 * 文件，Vercel 给这两个独立的 Edge 入口（Middleware + 这个 Edge
 * Function）构建时会把共同依赖的文件打进同一个共享 chunk，而这个共享
 * chunk 的产物又把这个文件自己独有的 @vercel/og / react 一起带进了
 * middleware 的产物列表，导致部署报错"Edge Function 'middleware' is
 * referencing unsupported modules"（Middleware 的运行时限制比普通 Edge
 * Function 更严，不允许 @vercel/og/react 这类模块）。
 *
 * 结论：Middleware 和普通 Edge Function 之间，哪怕共享的是完全零依赖的
 * 纯函数文件，也不能共用同一个 src/ 源文件——必须两边各自复制一份。跟
 * activities-repository.ts 的 ACTIVITY_CHANNEL_OPTIONS 不能 import 的
 * 原因不一样（那个文件顶部 import 了 getSupabaseClient，会拉进 Vite 专属
 * 链路），这里是纯粹的构建期 chunk 归属问题，不是代码本身有依赖问题。
 * 下面的频道表（ACTIVITY_CHANNEL_META）跟 middleware.ts 里的同名表是各自
 * 维护的两份，以后改频道文案/图标需要两处一起改。（分享卡片方图任务卡之后
 * 图上不再画地点和时间，原来从 src/ 复制过来的州名对照表和人数文案函数
 * 已经用不到，一并删掉了。）
 */
export const config = {
  runtime: "edge"
};

/**
 * 分享卡片方图任务卡：卡片从 1200×630 横图改成 600×600 方图。微信聊天里的
 * 链接卡片只显示一个很小的正方形缩略图，横图被缩小再裁切，标题/时间这些
 * 字完全看不清（标题和描述本来就显示在卡片左边的文字里）。方图只放缩略图
 * 里还能看清的两样东西：活动类型的大图标 + "限 N 人"标签；背景色按活动
 * 类型区分，群里多张卡片排在一起一眼能分出是吃饭还是拼车。
 *
 * 也去掉了原来图上的"还差 N 人（M/容量）"：卡片在微信里发出去之后就定格
 * 了，人数却一直在变，图上写一个会过时的数字会误导人；"限 N 人"是发起人
 * 设定的上限，不会变。详情页本身仍然实时显示报名进度。
 */
const CARD_SIZE = 600;

interface ChannelStyle {
  label: string;
  emoji: string;
  /** 径向渐变的三个色标：高光 / 主色 / 暗部，标签文字用暗部色。 */
  light: string;
  base: string;
  dark: string;
}

const ACTIVITY_CHANNEL_META: Record<string, ChannelStyle> = {
  food: { label: "吃饭搭子", emoji: "🍜", light: "#FF9F5A", base: "#FF7A3D", dark: "#E85A1F" },
  carpool: { label: "拼车/一起采购", emoji: "🚗", light: "#3CC47F", base: "#1FA463", dark: "#12804B" },
  fitness: { label: "健身搭子", emoji: "🏋️", light: "#4A72F0", base: "#2F5BE8", dark: "#1E3FAE" },
  game: { label: "游戏搭子", emoji: "🎮", light: "#A78BFA", base: "#8B5CF6", dark: "#6D3FE0" },
  study: { label: "学习搭子", emoji: "📚", light: "#F5B820", base: "#E5A100", dark: "#C08400" },
  travel: { label: "旅游搭子", emoji: "✈️", light: "#0E86C7", base: "#0369A1", dark: "#075985" },
  entertainment: { label: "娱乐搭子", emoji: "🎬", light: "#F06A97", base: "#E8457C", dark: "#C92A60" },
  other: { label: "其他", emoji: "🤝", light: "#7C8BA1", base: "#5B6B82", dark: "#3F4C5F" }
};

/**
 * "其他"类型按标题关键词换一个更贴切的图标，没命中就用默认的 🤝。按数组
 * 顺序取第一个命中的。只影响这张分享图，不改数据库也不改发布流程——以后
 * 发现"其他"里经常出现某类活动，在这里加一行即可。
 */
const OTHER_CHANNEL_KEYWORD_EMOJI: Array<[string[], string]> = [
  [["遛狗", "狗", "宠物", "猫"], "🐕"],
  [["羽毛球"], "🏸"],
  [["篮球"], "🏀"],
  [["足球"], "⚽"],
  [["网球"], "🎾"],
  [["乒乓"], "🏓"],
  [["爬山", "徒步", "登山"], "🥾"],
  [["露营"], "⛺"],
  [["钓鱼"], "🎣"],
  [["K歌", "k歌", "KTV", "ktv", "唱歌"], "🎤"],
  [["咖啡"], "☕"],
  [["奶茶"], "🧋"],
  [["购物", "逛街", "outlet", "Outlet"], "🛍️"],
  [["跑步", "夜跑", "晨跑"], "🏃"],
  [["游泳"], "🏊"],
  [["滑雪"], "⛷️"],
  [["麻将"], "🀄"],
  [["桌游", "狼人杀", "剧本杀"], "🎲"]
];

function getChannelStyle(channel: string): ChannelStyle {
  return ACTIVITY_CHANNEL_META[channel] ?? ACTIVITY_CHANNEL_META.other;
}

function resolveCardEmoji(row: ActivityRow): string {
  const style = getChannelStyle(row.channel);
  if (row.channel !== "other" && ACTIVITY_CHANNEL_META[row.channel]) return style.emoji;
  const title = row.title ?? "";
  const hit = OTHER_CHANNEL_KEYWORD_EMOJI.find(([keywords]) =>
    keywords.some((keyword) => title.includes(keyword))
  );
  return hit ? hit[1] : style.emoji;
}

function formatCapacityBadge(capacity: number | null): string {
  return capacity === null ? "人数不限" : `限 ${capacity} 人`;
}

interface ActivityRow {
  channel: string;
  title: string;
  capacity: number | null;
  status: string;
}

const BRAND_BLUE: Pick<ChannelStyle, "light" | "base" | "dark"> = {
  light: "#4A72F0",
  base: "#2F5BE8",
  dark: "#1E3FAE"
};

/** 方图的统一版式：渐变背景 + 半透明圆底大图标 + 白色胶囊标签。 */
function SquareCard({
  emoji,
  badge,
  colors
}: {
  emoji: string;
  badge: string;
  colors: Pick<ChannelStyle, "light" | "base" | "dark">;
}) {
  return (
    <div
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: `radial-gradient(circle at 70% 25%, ${colors.light} 0%, ${colors.base} 45%, ${colors.dark} 100%)`
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
          background: "#FFFFFF",
          color: colors.dark,
          fontSize: 52,
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

function ActivityCard({ row }: { row: ActivityRow }) {
  return (
    <SquareCard
      emoji={resolveCardEmoji(row)}
      badge={formatCapacityBadge(row.capacity)}
      colors={getChannelStyle(row.channel)}
    />
  );
}

const FALLBACK_BADGE = "找搭子";

/**
 * 通用品牌兜底卡：活动不存在/被软删除/被 RLS 挡掉/已结束/已取消时用——
 * 不画任何具体活动信息，也不把内部错误信息画到图上。
 */
function FallbackCard() {
  return <SquareCard emoji="🤝" badge={FALLBACK_BADGE} colors={BRAND_BLUE} />;
}

/**
 * 收集卡片上会出现的全部文字，只请求覆盖这些字符的字体子集（而不是整包
 * 体积巨大的完整中文字体），见下面 loadFontSubset() 的详细说明。
 */
function collectCardText(row: ActivityRow | null): string {
  return row ? formatCapacityBadge(row.capacity) : FALLBACK_BADGE;
}

/**
 * 中文字体加载——Satori 不自带任何中文字形，不配字体的话中文会安静地
 * 渲染成方块/空白，不会报错（这是任务卡特别强调的坑）。
 *
 * 没有把字体文件下载后打包进仓库（尽管任务卡建议的是这个做法）：实测
 * Google Fonts 提供的 Noto Sans SC Bold 完整字重文件有 10.5MB
 * （见完工报告），这个体积对一个 Edge Function 来说风险很大——不只是
 * "冷启动变慢"，Vercel Edge Function 有打包体积上限，10MB+ 的单个静态
 * 资源有直接导致部署失败的风险，而且活动标题/地点是完全自由的用户输入，
 * 任何预先裁剪的"常用字"子集都无法保证覆盖到所有可能出现的汉字。
 *
 * 改用 Google Fonts 的动态子集化能力：css2 API 支持 `text=` 参数，只返回
 * 覆盖这些指定字符的字体文件——实测传入这张卡片实际会用到的字符（品牌名+
 * 频道文案+示例标题+时间+地点/人数文案）得到的字体文件只有 3.2KB
 * （对比完整包 10.5MB），且天然覆盖当前这张卡片真正需要的每一个字符
 * （因为是按这次请求的真实文字现查的，不是预先猜的固定子集），不会有
 * "预置子集漏字"的问题。代价：每次生成卡片多一次到 Google Fonts 的网络
 * 往返；如果这次请求失败（网络问题/Google Fonts 那边不可用），不让整个
 * 接口跟着失败——捕获异常后退回不带自定义字体渲染（后果是中文会变成方块，
 * 这是明确写进完工报告的已知风险，不是被忽略的边界情况）。
 */
async function loadFontSubset(text: string): Promise<ArrayBuffer | null> {
  const uniqueChars = [...new Set(text)].join("");
  if (!uniqueChars) return null;

  try {
    const cssUrl = new URL("https://fonts.googleapis.com/css2");
    cssUrl.searchParams.set("family", "Noto Sans SC:wght@700");
    cssUrl.searchParams.set("text", uniqueChars);
    cssUrl.searchParams.set("display", "swap");

    // 必须用一个"简单"的 User-Agent——Google Fonts 会根据 UA 判断返回
    // woff2 还是 ttf；Satori 对 woff2 的支持依赖运行时是否具备对应的
    // 解压能力，ttf 是兼容性最好、最不容易在 Edge Runtime 里出问题的
    // 格式，这里用一个不带任何现代浏览器特征的 UA 字符串换取 Google
    // Fonts 回退到 ttf。
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

async function renderCard(row: ActivityRow | null): Promise<ImageResponse> {
  const fontData = await loadFontSubset(collectCardText(row));

  return new ImageResponse(row ? <ActivityCard row={row} /> : <FallbackCard />, {
    width: CARD_SIZE,
    height: CARD_SIZE,
    fonts: fontData ? [{ name: "Noto Sans SC", data: fontData, weight: 700, style: "normal" }] : []
  });
}

/**
 * 已结束/已取消的活动：activities_select_public 这条 RLS
 * （`deleted_at is null and status <> 'cancelled'`）已经会把 cancelled
 * 的活动过滤成查不到（走下面"查不到"分支），但 status = 'ended' 的活动
 * RLS 并不排除（已结束的活动本来就应该能被公开看到详情），所以这里需要
 * 显式判断 status === 'ended'，不能指望 RLS 帮忙挡掉——两者都退回通用
 * 品牌兜底卡，不展示具体活动信息。
 */
function shouldShowFallback(row: ActivityRow): boolean {
  return row.status === "ended" || row.status === "cancelled";
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const activityId = url.searchParams.get("id");

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!activityId || !supabaseUrl || !supabaseAnonKey) {
    return renderCard(null);
  }

  const restUrl =
    `${supabaseUrl}/rest/v1/activities` +
    `?id=eq.${encodeURIComponent(activityId)}` +
    "&select=channel,title,capacity,status";

  let rows: ActivityRow[];
  try {
    const restResponse = await fetch(restUrl, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      }
    });
    if (!restResponse.ok) {
      return renderCard(null);
    }
    rows = (await restResponse.json()) as ActivityRow[];
  } catch {
    return renderCard(null);
  }

  // 走 anon 角色，不存在/被软删除/被 activities_select_public 挡掉（比如
  // cancelled）都会让这里查不到任何行，统一退回通用兜底卡，不区分具体
  // 原因——跟 middleware.ts 对帖子"查不到就 return next()"是同一个"不向
  // 未授权访问者泄露内部状态"的原则，只是这里没有 SPA 兜底可退，退回
  // 通用品牌卡片。
  const row = rows[0];
  if (!row || shouldShowFallback(row)) {
    return renderCard(null);
  }

  return renderCard(row);
}

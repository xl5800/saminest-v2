import { ImageResponse } from "@vercel/og";
import React from "react";

import { formatLocationDisplayName } from "../../src/data/us-states";
import { formatActivityParticipantSummary } from "../../src/utils/format";

/**
 * 找搭子活动分享卡片任务卡：这个文件跟 middleware.ts 一样是独立的 Vercel
 * Edge Function，不经过 Vite 打包（Vercel 自己的 esbuild 流水线）。这里
 * 因此只能 import 那些不依赖 import.meta.env / DOM 的纯逻辑文件——
 * ../../src/utils/format.ts 和 ../../src/data/us-states.ts 都是零 import
 * 的纯函数文件（已核实过，不会拉进 src/integrations/supabase/client.ts
 * 那条 Vite 专属链路），可以放心直接复用；activities-repository.ts 的
 * ACTIVITY_CHANNEL_OPTIONS/getActivityChannelMeta 则不行——那个文件顶部
 * 就 import 了 getSupabaseClient，跟 middleware.ts 顶部注释警告的问题
 * 一样，这里选择跟 middleware.ts 的 resolveCoverImageUrl 同一个做法：
 * 把频道 emoji/文案单独复制一份到这个文件里（见下面
 * ACTIVITY_CHANNEL_META），不是没注意到已经有一份，是不能 import。
 */
export const config = {
  runtime: "edge"
};

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

// BrandMark 里展示的品牌角标文字，两种卡片（真实活动卡/通用兜底卡）
// 共用。真实 bug 记录：collectCardText() 第一版忘了把这个常量也加进去
// 一起请求字体子集——BrandMark 是唯一一处不经过任何"卡片文案"函数、直接
// 硬编码在 JSX 里的文字，本地用 satori 直接渲染真实活动数据肉眼验证时
// 才发现"Saminest"这几个字母时不时渲染成方块（取决于那次请求里恰好有
// 没有别的文字碰巧包含同一个字母）——根因是字体子集只覆盖
// collectCardText() 返回的字符，Satori 对没配到的字形不报错、只留空/
// 方块，这正是任务卡特别提醒的坑，这里改成两处都引用同一个常量，不会
// 再意外漏掉。
const BRAND_WORDMARK = "Saminest";

const ACTIVITY_CHANNEL_META: Record<string, { label: string; emoji: string }> = {
  food: { label: "吃饭搭子", emoji: "🍜" },
  carpool: { label: "拼车/一起采购", emoji: "🚗" },
  fitness: { label: "健身搭子", emoji: "🏋️" },
  game: { label: "游戏搭子", emoji: "🎮" },
  study: { label: "学习搭子", emoji: "📚" },
  travel: { label: "旅游搭子", emoji: "✈️" },
  entertainment: { label: "娱乐搭子", emoji: "🎬" },
  other: { label: "其他", emoji: "🔖" }
};

function getActivityChannelMeta(channel: string): { label: string; emoji: string } {
  return ACTIVITY_CHANNEL_META[channel] ?? { label: channel, emoji: "🔖" };
}

interface ActivityRow {
  channel: string;
  title: string;
  start_at: string;
  is_online: boolean;
  capacity: number | null;
  participant_count: number;
  status: string;
  location: { name: string } | null;
  landmark_text: string | null;
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * 分享卡片专用的时间格式化——刻意跟 src/utils/format.ts 的
 * formatActivityStartAt()（app 内其它地方展示活动时间统一用的格式，输出
 * 形如"09-28 12:00"）不一样，是这次任务里唯一一处主动偏离"复用现有格式
 * 函数"这条总原则的地方，原因见完工报告：这张卡片是给微信等外部平台看的
 * 营销素材，视觉稿 docs/share-card-design/og-card.html 已经明确给出并且
 * 是产品认可过的示例文案"10月1日 周四 12:00"——这个"月/日/周X"格式仓库里
 * 目前没有任何现成函数产出，app 内其它地方（详情页/列表页）用的
 * "MM-DD HH:mm"是更紧凑的内部展示形式，不适合直接照搬到对外分享的营销
 * 素材上。两处如果以后要统一，需要产品先确认改哪一边。
 */
function formatShareCardStartAt(startAt: string): string {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "时间待定";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAY_LABELS[date.getDay()];
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 周${weekday} ${hours}:${minutes}`;
}

/**
 * 线下活动地点文案：跟 activity-detail-page.tsx 那句
 * `data.landmarkText ?? (data.locationName ? formatLocationDisplayName(...) : "地点待定")`
 * 逐字同一套 fallback 顺序，只是这里从 REST 原始 snake_case 字段读。
 */
function formatOfflineLocation(row: ActivityRow): string {
  if (row.landmark_text) return row.landmark_text;
  if (row.location?.name) return formatLocationDisplayName(row.location.name);
  return "地点待定";
}

/**
 * 第二行 meta 文案：线上活动只显示"线上活动"（任务卡原话，没有要求线上
 * 也拼人数）；线下拼"地点 · 人数状态"，人数状态复用
 * formatActivityParticipantSummary()——跟活动详情页/活动卡片"还差 N 人
 * （M/容量）"/"已满员"是同一个算法，不重新写一套措辞。
 */
function buildSecondMetaLine(row: ActivityRow): string {
  if (row.is_online) return "线上活动";
  const location = formatOfflineLocation(row);
  const participantSummary = formatActivityParticipantSummary(row.participant_count, row.capacity);
  return `${location} · ${participantSummary}`;
}

const CLOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth={2} />
    <path d="M12 7V12L15.5 14" stroke="white" strokeWidth={2} strokeLinecap="round" />
  </svg>
);

const PIN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 22s7-7.58 7-12.5A7 7 0 0 0 5 9.5C5 14.42 12 22 12 22Z"
      stroke="white"
      strokeWidth={2}
      strokeLinejoin="round"
    />
    <circle cx="12" cy="9.5" r="2.4" stroke="white" strokeWidth={2} />
  </svg>
);

const BRAND_MARK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="10" r="7" fill="none" stroke="white" strokeWidth={2.4} />
    <circle cx="12" cy="15.2" r="2.6" fill="white" />
  </svg>
);

/**
 * 品牌 mark + 文字，跟 og-card.html 的 .brand 一致，两种卡片（真实活动卡/
 * 通用兜底卡）共用同一个品牌角标，位置固定右上角。
 */
function BrandMark() {
  return (
    <div
      style={{
        position: "absolute",
        top: 44,
        right: 52,
        display: "flex",
        alignItems: "center",
        gap: 14
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: "rgba(255,255,255,0.16)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <div style={{ width: 24, height: 24, display: "flex" }}>{BRAND_MARK_ICON}</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
        {BRAND_WORDMARK}
      </div>
    </div>
  );
}

/** 两个装饰性光斑圆点，跟 og-card.html 的 .blob/.blob2 一致。 */
function BackgroundBlobs() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          width: 820,
          height: 820,
          right: -220,
          top: -260,
          borderRadius: 9999,
          background: "rgba(255,255,255,0.06)"
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          left: -160,
          bottom: -220,
          borderRadius: 9999,
          background: "rgba(255,255,255,0.05)"
        }}
      />
    </>
  );
}

/** 最外层容器：径向渐变蓝色背景，跟 og-card.html 的 body 一致。 */
function CardBackground({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        display: "flex",
        position: "relative",
        backgroundImage:
          "radial-gradient(circle at 85% 15%, #4A72F0 0%, #315BEA 42%, #1E3FAE 100%)"
      }}
    >
      {children}
    </div>
  );
}

/**
 * 真实活动卡片——channel tag / 标题（最多两行）/ 时间 / 地点+人数，逐字
 * 还原 og-card.html 的布局坐标（top/left/right/bottom 数值直接照抄那份
 * 视觉稿，不是估算）。
 */
function ActivityCard({ row }: { row: ActivityRow }) {
  const { emoji, label } = getActivityChannelMeta(row.channel);
  const timeLine = formatShareCardStartAt(row.start_at);
  const secondMetaLine = buildSecondMetaLine(row);

  return (
    <CardBackground>
      <BackgroundBlobs />

      <div
        style={{
          position: "absolute",
          top: 64,
          left: 64,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(255,255,255,0.18)",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 9999,
          padding: "12px 26px",
          fontSize: 26,
          fontWeight: 700,
          color: "#FFFFFF"
        }}
      >
        <span>{emoji}</span>
        <span>{label}</span>
      </div>

      <BrandMark />

      <div
        style={{
          position: "absolute",
          left: 64,
          top: 190,
          right: 120,
          fontSize: 64,
          fontWeight: 700,
          color: "#FFFFFF",
          lineHeight: 1.32,
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
          overflow: "hidden"
        }}
      >
        {row.title}
      </div>

      <div
        style={{
          position: "absolute",
          left: 64,
          bottom: 76,
          display: "flex",
          flexDirection: "column",
          gap: 22
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "rgba(255,255,255,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <div style={{ width: 26, height: 26, display: "flex" }}>{CLOCK_ICON}</div>
          </div>
          <div style={{ fontSize: 34, fontWeight: 600, color: "#FFFFFF" }}>{timeLine}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "rgba(255,255,255,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <div style={{ width: 26, height: 26, display: "flex" }}>{PIN_ICON}</div>
          </div>
          <div style={{ fontSize: 34, fontWeight: 600, color: "#FFFFFF" }}>{secondMetaLine}</div>
        </div>
      </div>
    </CardBackground>
  );
}

/**
 * 通用品牌兜底卡：活动不存在/被软删除/被 RLS 挡掉/已结束/已取消时用——
 * 不画任何具体活动信息，也不把内部错误信息画到图上（任务卡明确要求）。
 */
function FallbackCard() {
  return (
    <CardBackground>
      <BackgroundBlobs />
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          top: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 24
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 20,
            background: "rgba(255,255,255,0.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <div style={{ width: 48, height: 48, display: "flex" }}>{BRAND_MARK_ICON}</div>
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, color: "#FFFFFF" }}>找搭子</div>
        <div style={{ fontSize: 32, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
          在 Saminest 找到同城搭子
        </div>
      </div>
    </CardBackground>
  );
}

/**
 * 收集卡片上会出现的全部文字，只请求覆盖这些字符的字体子集（而不是整包
 * 体积巨大的完整中文字体），见下面 loadFontSubset() 的详细说明。
 */
function collectCardText(row: ActivityRow | null): string {
  if (!row) {
    return `找搭子在${BRAND_WORDMARK}找到同城搭子`;
  }
  const { emoji, label } = getActivityChannelMeta(row.channel);
  return [
    emoji,
    label,
    row.title,
    formatShareCardStartAt(row.start_at),
    buildSecondMetaLine(row),
    BRAND_WORDMARK
  ].join("");
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
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
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
    "&select=channel,tag_text,title,start_at,is_online,capacity,participant_count,status,location:locations(name),landmark_text";

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

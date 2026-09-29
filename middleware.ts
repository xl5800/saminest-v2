import { next } from "@vercel/functions";

/**
 * 拦截帖子详情页和找搭子活动详情页这两条路由（真实路径见
 * src/router/routes.tsx 的 `path: "post/:id"` / `path: "activities/:id"`,
 * 注意活动这条是复数 `activities`）。两条 matcher 都精确到单层路径段，
 * 不会命中 `/post/:id/report`、`/activities/:id/report`、
 * `/activities/:id/notify` 这些子路径。
 */
export const config = {
  matcher: ["/post/:id", "/activities/:id"]
};

const DESCRIPTION_MAX_LENGTH = 200;

interface PostImageRow {
  public_url: string | null;
  sort_order: number;
  deleted_at: string | null;
}

interface PostRow {
  title: string;
  description: string | null;
  price_amount: number | null;
  price_label: string | null;
  post_images: PostImageRow[] | null;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 封面图规则：只从 deleted_at 为 null 的活跃图片里选 sort_order 最小的
 * 一张，跟 src/repositories/posts-repository.ts 的 resolveCoverImageUrl
 * 是同一个算法，但这里没有直接 import 那个函数复用——理由：
 * 1. 那个函数在原文件里没有 export；
 * 2. 那个文件所在的模块图会一路拉到 src/integrations/supabase/client.ts，
 *    那边读的是 Vite 专属的 import.meta.env，而这个文件是独立的 Vercel
 *    Edge Middleware，走 Vercel 自己的 esbuild 打包、不经过 Vite，import
 *    这条链路在构建期就会直接失败；
 * 3. 这里拿到的是 Supabase REST API 的原始 JSON（snake_case 字段），跟
 *    app 里已经映射成 camelCase 的类型形状不一样，函数签名对不上，需要
 *    额外的适配代码，不如照抄同一段算法直接写一遍。
 * 是刻意的重新实现，不是没注意到已经有这个函数——两处如果以后要改选封面图
 * 的规则，需要同时改这两个地方。
 */
function resolveCoverImageUrl(images: PostImageRow[] | null): string | null {
  const activeImages = (images ?? []).filter((image) => image.deleted_at === null);
  if (activeImages.length === 0) {
    return null;
  }
  return activeImages.reduce((min, image) => (image.sort_order < min.sort_order ? image : min))
    .public_url;
}

function formatPriceSummary(priceAmount: number | null, priceLabel: string | null): string {
  if (priceLabel) return priceLabel;
  if (priceAmount === null) return "价格未填写";
  return `$${priceAmount}`;
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

// ============================================================
// 找搭子活动分享卡片任务卡：/activities/:id 的 OG 标签注入
// ============================================================

interface ActivityRow {
  channel: string;
  title: string;
  start_at: string;
  is_online: boolean;
  capacity: number | null;
  participant_count: number;
  location: { name: string } | null;
  landmark_text: string | null;
}

/**
 * 频道 emoji/文案：跟 api/og/activity.tsx 里的 ACTIVITY_CHANNEL_META 是
 * 逐字重复的两份，不是漏改——两个文件都是独立的 Vercel Edge
 * Function/Middleware，都不能 import
 * src/repositories/activities-repository.ts 的 ACTIVITY_CHANNEL_OPTIONS
 * （那个文件顶部 import 了 getSupabaseClient，会拉进 Vite 专属的
 * import.meta.env 链路，构建期直接失败，理由跟上面 resolveCoverImageUrl
 * 的注释一致），也不能互相 import 对方（middleware.ts 如果 import
 * api/og/activity.tsx，会把那边的 @vercel/og 整个依赖树一起拉进
 * Middleware 的打包体积——Middleware 的体积预算比普通 Edge Function 更紧，
 * 不值得为了少写十行文案换来这个风险）。以后如果要改频道文案，需要
 * 同时改 api/og/activity.tsx 和这里两处。
 */
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

/**
 * 下面两个函数原来是直接 import src/utils/format.ts 的
 * formatActivityStartAt/formatActivityParticipantSummary——那个文件确实
 * 零 import，但实测部署后仍然报错：api/og/activity.tsx 也 import 了同一个
 * 文件，Vercel 给 Middleware + 这个 Edge Function 构建时会把共同依赖打进
 * 同一个共享 chunk，这个共享 chunk 的产物又把 api/og/activity.tsx 独有的
 * @vercel/og / react 一起带进了 middleware 的产物列表，触发"Edge Function
 * 'middleware' is referencing unsupported modules"（Middleware 的运行时
 * 限制比普通 Edge Function 更严）。结论：跟 api/og/activity.tsx 之间哪怕
 * 共享的是零依赖纯函数文件也不能共用同一个 src/ 源文件，这里改成逐字
 * 复制的独立副本（详细说明见 api/og/activity.tsx 顶部注释）。
 */
function formatActivityStartAt(startAt: string): string {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function formatActivityParticipantSummary(participantCount: number, capacity: number | null): string {
  const joinedCount = participantCount + 1; // +1：发起人本人
  if (capacity === null) {
    return `已有 ${joinedCount} 人报名`;
  }
  const remaining = Math.max(capacity - joinedCount, 0);
  return remaining > 0
    ? `还差 ${remaining} 人（${joinedCount}/${capacity}）`
    : `已满员（${joinedCount}/${capacity}）`;
}

/**
 * og:description 这一行文字——任务卡明确"跟卡片图片上的信息一致即可，
 * 不需要一字不差"。地点这里故意不做 formatLocationDisplayName 那个
 * "裸州代码转中文州名"的转换（比如线下活动地点是裸的 "VA"，这里就直接显示
 * "VA"，不会转成"VA 弗吉尼亚州"）——原因同上：那个转换需要 51 州对照表，
 * 这份对照表已经在 api/og/activity.tsx 里复制了一份给卡片图片（真正对外
 * 展示、访客会看到的部分）用，og:description 是次要的辅助文字，不值得为了
 * 这一处也复制一份 51 州数据，接受这个小的文案差异。
 */
function buildActivityDescription(row: ActivityRow): string {
  const { emoji, label } = getActivityChannelMeta(row.channel);
  const timeText = formatActivityStartAt(row.start_at);
  const locationOrParticipants = row.is_online
    ? "线上活动"
    : `${row.landmark_text ?? row.location?.name ?? "地点待定"} · ${formatActivityParticipantSummary(row.participant_count, row.capacity)}`;
  return `${emoji} ${label} · ${timeText} · ${locationOrParticipants}`;
}

async function handleActivityRequest(
  request: Request,
  activityId: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<Response> {
  const restUrl =
    `${supabaseUrl}/rest/v1/activities` +
    `?id=eq.${encodeURIComponent(activityId)}` +
    "&select=channel,title,start_at,is_online,capacity,participant_count,location:locations(name),landmark_text";

  let activities: ActivityRow[];
  try {
    const restResponse = await fetch(restUrl, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      }
    });
    if (!restResponse.ok) {
      return next();
    }
    activities = (await restResponse.json()) as ActivityRow[];
  } catch {
    return next();
  }

  // 走 anon 角色，不存在/被软删除/被 activities_select_public 挡掉（比如
  // cancelled）都会让这里查不到任何行——跟帖子那边"查不到就 return next()"
  // 是同一个原则。这里不额外判断 status === 'ended'：已结束的活动本来就
  // 应该能被公开看到详情，标题/描述这两个 OG 标签对已结束的活动仍然是
  // 准确、有意义的文字，不需要跟着退化；卡片图片本身要不要为已结束的
  // 活动展示通用兜底图，是 api/og/activity.tsx 单独的判断，这里不重复。
  const activity = activities[0];
  if (!activity) {
    return next();
  }

  const originHtml = await fetch(new URL("/index.html", request.url)).then((response) =>
    response.text()
  );

  const title = escapeHtml(activity.title);
  const description = escapeHtml(truncate(buildActivityDescription(activity), DESCRIPTION_MAX_LENGTH));
  const ogImageUrl = new URL("/api/og/activity", request.url);
  ogImageUrl.searchParams.set("id", activityId);

  const metaTags = [
    `<title>${title}</title>`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${escapeHtml(ogImageUrl.toString())}">`,
    `<meta property="og:url" content="${escapeHtml(request.url)}">`,
    `<meta property="og:type" content="website">`
  ].join("\n    ");

  const html = originHtml
    .replace(/<title>[^<]*<\/title>/, "")
    .replace("</head>", `    ${metaTags}\n  </head>`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

// 原来这里有一道"只认微信/Facebook/Twitter/WhatsApp 这几个 User-Agent
// 关键字才查数据库注入 OG 标签，其余请求直接放行"的前置判断，是为了给
// 普通用户请求省一次数据库查询。但这个判断依赖一份人工维护的关键字名单
// （SOCIAL_UA_MARKERS），微信生成分享卡片实际用的是另一个后台抓取
// 机器人，跟人在微信里点开链接时浏览器上报的 `MicroMessenger` 不是
// 同一个 UA——分享出去的卡片没有标题/图片，就是因为这个机器人的真实 UA
// 没在名单里，请求被直接放行、拿到手的是没有任何 OG 标签的默认页面。
// 腾讯没有公开这个抓取机器人的 UA 字符串，而且不排除以后还会变，与其
// 继续猜名单，不如干脆去掉这道判断——`/post/:id` 这一条路由现在的访问量
// 不大，每次请求多查一次数据库这点开销完全可以接受，用"总是正确"换掉
// "省一次查询但可能漏掉没见过的爬虫"。
export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // 找搭子活动分享卡片任务卡：`/activities/:id` 单独分支，跟 `/post/:id`
  // 走原有逻辑完全不变——这条分支只是插在最前面，post 那部分下面的代码
  // 逐字没有改动。
  const activityId = url.pathname.match(/^\/activities\/([^/]+)\/?$/)?.[1];
  if (activityId) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      // 跟帖子那边同一个理由：环境变量读不到就放行，不连累详情页整体
      // 不可用。
      return next();
    }
    return handleActivityRequest(request, activityId, supabaseUrl, supabaseAnonKey);
  }

  const postId = url.pathname.match(/^\/post\/([^/]+)\/?$/)?.[1];
  if (!postId) {
    return next();
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // 环境变量在 Edge/Middleware 运行时读不到——宁可放行走正常 SPA
    // 流程（普通用户体验不受影响，只是分享卡片退化成默认的
    // <title>Saminest</title>），也不应该因为 OG 标签这个增值功能的配置
    // 问题连累详情页整体不可用。
    return next();
  }

  const restUrl =
    `${supabaseUrl}/rest/v1/posts` +
    `?id=eq.${encodeURIComponent(postId)}` +
    `&select=title,description,price_amount,price_label,post_images(public_url,sort_order,deleted_at)`;

  let posts: PostRow[];
  try {
    const restResponse = await fetch(restUrl, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      }
    });
    if (!restResponse.ok) {
      return next();
    }
    posts = (await restResponse.json()) as PostRow[];
  } catch {
    return next();
  }

  // 走的是 anon 角色，未审核/已下架/已软删除的帖子天然被现有的 posts RLS
  // 策略过滤掉，这里查不到就是"帖子不存在，或者不该被公开看到"，交给正常
  // SPA 流程处理（该 404 就 404），不用自己再拼一遍 status 过滤条件。
  const post = posts[0];
  if (!post) {
    return next();
  }

  const originHtml = await fetch(new URL("/index.html", request.url)).then((response) =>
    response.text()
  );

  const coverImageUrl = resolveCoverImageUrl(post.post_images);
  const title = escapeHtml(post.title);
  const priceSummary = formatPriceSummary(post.price_amount, post.price_label);
  const rawDescription = post.description
    ? `${priceSummary} · ${post.description}`
    : priceSummary;
  const description = escapeHtml(truncate(rawDescription, DESCRIPTION_MAX_LENGTH));

  const metaTags = [
    `<title>${title}</title>`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    coverImageUrl
      ? `<meta property="og:image" content="${escapeHtml(coverImageUrl)}">`
      : null,
    `<meta property="og:url" content="${escapeHtml(request.url)}">`,
    `<meta property="og:type" content="website">`
  ]
    .filter((tag): tag is string => tag !== null)
    .join("\n    ");

  // 先去掉原来那行 <title>Saminest</title>（不管它长什么样，正则不写死
  // 具体文字），再把新拼好的标签（含新的 <title>）整块插到 </head> 前面，
  // 避免页面里同时出现两个 <title>。<body> 及以下（真正加载 React 的部分）
  // 完全不碰。
  const html = originHtml
    .replace(/<title>[^<]*<\/title>/, "")
    .replace("</head>", `    ${metaTags}\n  </head>`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

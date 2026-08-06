import { next } from "@vercel/functions";

/**
 * 只拦截帖子详情页这一条路由（真实路径见 src/router/routes.tsx 的
 * `path: "post/:id"`）。matcher 精确到 `/post/:id`（单层路径段），不会
 * 命中 `/post/:id/report` 这种子路径。
 */
export const config = {
  matcher: "/post/:id"
};

// 不止匹配"微信爬虫"，也故意匹配真实用户在微信/Facebook/Twitter/WhatsApp
// 内置浏览器里正常打开这个链接的请求——这些内置浏览器生成分享预览卡片时
// 走的也是同一条"抓取时不执行 JS"的路径，需要同样的服务端注入。真人在
// 这些内置浏览器里点开链接后，SPA 照常跑起来，用户体验完全不受影响
// （见下面对 originHtml 的处理方式）。
const SOCIAL_UA_MARKERS = ["MicroMessenger", "facebookexternalhit", "Twitterbot", "WhatsApp"];

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

function isSocialUserAgent(userAgent: string): boolean {
  const lowerUserAgent = userAgent.toLowerCase();
  return SOCIAL_UA_MARKERS.some((marker) => lowerUserAgent.includes(marker.toLowerCase()));
}

export default async function middleware(request: Request): Promise<Response> {
  const userAgent = request.headers.get("user-agent") ?? "";

  // 最重要的一步优化放在最前面：普通用户请求直接放行，不产生任何额外的
  // 数据库查询开销。
  if (!isSocialUserAgent(userAgent)) {
    return next();
  }

  const url = new URL(request.url);
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

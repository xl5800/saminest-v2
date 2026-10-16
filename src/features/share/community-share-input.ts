import { PRODUCTION_ORIGIN } from "../../utils/constants";
import type { ShareLinkInput } from "./share-link";

/**
 * 社区分享卡片任务卡：社区帖子 / 社区主页分享时传给 useShareLink().share()
 * 的内容。帖子在列表操作行和详情页两处分享，放在这里保证两处一致。
 *
 * 链接末尾的 ?s= 跟找搭子活动、二手帖子是同一个做法（见
 * activity-detail-page.tsx 的 handleShare）：每次分享都是新链接，微信会
 * 重新抓一次卡片，帖子改过以后不会一直显示旧卡片。
 *
 * title/text 只在 App 原生分享面板和 navigator.share 里用得到；微信里转发
 * 时卡片内容来自 middleware.ts 注入的 og 标签，跟这里无关。
 */
const POST_TITLE_FROM_BODY_LENGTH = 30;

export function buildCommunityPostShareInput(post: {
  id: string;
  title: string | null;
  body: string;
  communityName: string;
}): ShareLinkInput {
  const body = post.body.replace(/\s+/g, " ").trim();
  const title =
    post.title?.trim() ||
    (body.length > POST_TITLE_FROM_BODY_LENGTH ? `${body.slice(0, POST_TITLE_FROM_BODY_LENGTH)}…` : body);
  return {
    title,
    text: `${post.communityName} · 华邻`,
    url: `${PRODUCTION_ORIGIN}/community/post/${post.id}?s=${Date.now()}`
  };
}

export function buildCommunityShareInput(community: {
  slug: string;
  name: string;
  description: string | null;
}): ShareLinkInput {
  return {
    title: `${community.name} · 华邻`,
    text: community.description?.trim() || "华邻上的同城华人社区",
    url: `${PRODUCTION_ORIGIN}/community/${encodeURIComponent(community.slug)}?s=${Date.now()}`
  };
}

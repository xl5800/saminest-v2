import type { CommunityPostType } from "../../repositories/community-repository";

/**
 * 社区帖子类型 → 中文标签。Feed 卡片 pill、详情页 pill、发帖页下拉框三处共用
 * 同一份映射，顺序也是发帖页下拉框的展示顺序（第一项 discussion 是默认值，
 * 跟数据库 community_posts.post_type 的默认值一致）。
 */
export const COMMUNITY_POST_TYPE_OPTIONS: ReadonlyArray<{
  value: CommunityPostType;
  label: string;
}> = [
  { value: "discussion", label: "讨论" },
  { value: "question", label: "提问" },
  { value: "help", label: "求助" },
  { value: "recommend", label: "推荐" },
  { value: "local_info", label: "本地资讯" },
  { value: "share", label: "分享" }
];

const LABEL_BY_TYPE = new Map<string, string>(
  COMMUNITY_POST_TYPE_OPTIONS.map((option) => [option.value, option.label])
);

/** 数据库 check 约束保证 post_type 只会是上面六个值之一，这里仍然给一个兜底，
 *  万一以后数据库新增了类型、前端还没跟上，不至于渲染成空白 pill。 */
export function getCommunityPostTypeLabel(postType: string): string {
  return LABEL_BY_TYPE.get(postType) ?? "讨论";
}

export const COMMUNITY_POST_TYPE_PILL_CLASS_NAME =
  "inline-block rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary";

export const COMMUNITY_TITLE_MAX_LENGTH = 120;
export const COMMUNITY_BODY_MAX_LENGTH = 10000;

/**
 * 社区帖子文字样式（参照 Reddit 帖子：标题粗体接近黑色，正文深灰常规字重）。
 * 首页 / 单个社区页 / 搜索结果 / 我的社区发帖 / 详情页共用这几份，改一处全站
 * 一起变，不再各页面各写一套字号字重。
 */
export const COMMUNITY_POST_LIST_TITLE_CLASS_NAME =
  "line-clamp-2 break-words text-lg font-bold leading-snug text-text";
export const COMMUNITY_POST_LIST_PREVIEW_CLASS_NAME =
  "line-clamp-3 break-words text-[15px] leading-normal text-text-body";
export const COMMUNITY_POST_DETAIL_TITLE_CLASS_NAME =
  "break-words text-[22px] font-bold leading-snug text-text";
export const COMMUNITY_POST_DETAIL_BODY_CLASS_NAME =
  "whitespace-pre-wrap break-words text-[17px] leading-[1.6] text-text-body";

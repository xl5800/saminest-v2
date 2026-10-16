/**
 * 注册时自动分配的默认昵称（注册登录简化任务卡）。
 *
 * 注册页不再让用户填"显示名称"（从微信群点进来的新用户多填一项就多一批
 * 人放弃），但 profiles.display_name 是 not null，注册时先给一个
 * "同城用户 + 4 位随机数"的默认名字。用户第一次报名活动或发私信时（那时候
 * 对方才会看到这个名字），再弹窗提示改一个，可以跳过，见
 * components/nickname-prompt-sheet.tsx。
 *
 * 判断"还是默认昵称"用的是格式匹配，不新增数据库字段：用户自己恰好起了
 * 一个"同城用户1234"这种名字的概率可以忽略，最坏情况也只是多被提示一次。
 */
export const DEFAULT_DISPLAY_NAME_PREFIX = "同城用户";

const DEFAULT_DISPLAY_NAME_PATTERN = new RegExp(`^${DEFAULT_DISPLAY_NAME_PREFIX}\\d{4}$`);

export function generateDefaultDisplayName(random: () => number = Math.random): string {
  const digits = String(Math.floor(random() * 10000)).padStart(4, "0");
  return `${DEFAULT_DISPLAY_NAME_PREFIX}${digits}`;
}

export function isDefaultDisplayName(name: string | null | undefined): boolean {
  return !!name && DEFAULT_DISPLAY_NAME_PATTERN.test(name.trim());
}

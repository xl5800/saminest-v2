/**
 * 手机号注册任务卡（影子邮箱方案）：手机号本身不是 Supabase Auth 的登录
 * 凭证，前端把手机号转换成一个用户永远看不到的"影子邮箱"
 * （`<归一化后的手机号>@phone.saminest.internal`），拿这个影子邮箱去走
 * 现成的 supabase.auth.signUp/signInWithPassword——不引入任何新的后端
 * 行为，手机号用户和邮箱用户走的是完全相同的 Auth 调用。
 *
 * 这里统一放"手机号 ⇄ 影子邮箱"的转换逻辑和邮箱/手机号格式判断，供
 * register-page.tsx/login-page.tsx 共用，不在两个页面里各写一份。
 */
const SHADOW_EMAIL_DOMAIN = "phone.saminest.internal";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 归一化：去掉除数字以外的字符（空格、括号、横线、+ 号）。 */
export function normalizePhoneDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/** 10 位（本地）或 11 位且以 1 开头（带国码）判定为合法手机号，跟
 *  profiles_phone_format_check 那条 DB 约束的宽松程度保持一致（DB 那边
 *  额外允许到 15 位是为了兼容非美国号码，这里前端只做基本的"看起来像不像
 *  手机号"判断，不是唯一防线）。 */
export function isLikelyPhone(input: string): boolean {
  const digits = normalizePhoneDigits(input);
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

export function isLikelyEmail(input: string): boolean {
  return EMAIL_PATTERN.test(input.trim());
}

/** 手机号 → 影子邮箱。只用于喂给 supabase.auth.signUp/signInWithPassword
 *  的 email 参数，不会展示给用户，也不会真的收发邮件——见文件顶部说明。 */
export function phoneToShadowEmail(phoneDigits: string): string {
  return `${phoneDigits}@${SHADOW_EMAIL_DOMAIN}`;
}

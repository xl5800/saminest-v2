# 任务卡：登录/注册支持手机号（邮箱或手机号二选一）

## 对应 worktree
路径：`../saminest-v2-phone-auth`
分支：`feat/phone-auth`

## 背景
BARRY 要求登录/注册页的"邮箱"输入框改成"邮箱或手机号"，同时支持用手机号完成注册和登录，这一轮明确不做短信验证码。

跟 BARRY 确认过技术方案：**影子邮箱方案**。数据库这边已经在生产库加了一列 `profiles.phone`（可选、格式校验 `^\+?[0-9]{10,15}$`、唯一索引，且专门收紧了列级权限，不会被 `profiles_select_public_or_self` 这类公开读策略连带暴露出去——见迁移 `add_profiles_phone_shadow_email`），并且重新生成了 `src/types/database.generated.ts`（已经提交到 main，这个 worktree 从最新 main 拉出来的时候应该已经带着这份新类型）。

手机号本身**不是** Supabase Auth 的登录凭证——Supabase 这个项目的账号体系目前是纯邮箱+密码（见 `auth-service.ts`），这次不改这个底层机制，也不接入 Supabase 自己的 Phone Auth/短信服务。做法是：前端把手机号转换成一个用户永远看不到的"影子邮箱"（形如 `<归一化后的手机号>@phone.saminest.internal`），拿这个影子邮箱去走 Supabase 现成的 `signUp`/`signInWithPassword`，`profiles.phone` 这一列只是留存真实手机号本身（不参与登录判断，前端也不会去读它）。这个设计的关键性质：**不引入任何新的后端行为**——不管是注册还是登录，手机号用户走的都是和邮箱用户完全相同的 `supabase.auth.signUp`/`signInWithPassword` 调用，只是传的 `email` 参数是算出来的而不是用户直接输入的，所以邮箱确认开关等现有账号体系的行为对手机号用户和邮箱用户是完全对称的，不需要单独处理。

手机号重复注册会在 Supabase Auth 层面自然被挡住（两个人生成同一个影子邮箱，第二次 `signUp` 会命中"邮箱已存在"），不需要额外查重逻辑。

## 具体改法

### 1. 新建 `src/utils/phone-identity.ts`
统一放"手机号 ⇄ 影子邮箱"的转换逻辑和邮箱/手机号格式判断，供 register-page.tsx/login-page.tsx 共用（不要在两个页面里各写一份）：

```ts
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
 *  的 email 参数，不会展示给用户，也不会真的收发邮件——见本任务卡背景
 *  说明。 */
export function phoneToShadowEmail(phoneDigits: string): string {
  return `${phoneDigits}@${SHADOW_EMAIL_DOMAIN}`;
}
```

### 2. `src/services/auth/auth-service.ts`
`SignUpInput`/`signUp()` 需要多接一个可选的 `phone`（归一化后的数字），插入 profile 的时候一起带上：
```ts
export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  /** 手机号注册任务卡新增：真实手机号（归一化后的数字，不是影子邮箱），
   *  只在用户走手机号注册路径时有值——邮箱注册路径不传。写进
   *  profiles.phone，不参与登录判断（登录判断靠 email 这个字段本身，
   *  不管它是真邮箱还是影子邮箱）。 */
  phone?: string;
}
```
`signUp()` 方法体里调用 `createProfile` 的地方加上 `phone: input.phone ?? null`：
```ts
      await createProfile({ id: data.user.id, displayName: input.displayName, phone: input.phone ?? null });
```

### 3. `src/repositories/profiles-repository.ts`
找到 `createProfile` 的函数签名和插入逻辑，加一个可选的 `phone` 参数，插入时带上 `phone` 列（为 `null` 时就是插入 null，跟 `bio`/`age` 那些可选字段目前的写法保持一致）。**不要**改 `getPublicProfile()`/`getMyProfile()`（或任何 `select` 语句）去带出 `phone` 这一列——这一列本来就没有公开 SELECT 权限（生产库已经收紧过列级授权），客户端代码也不应该尝试读它。

### 4. `src/pages/register/register-page.tsx`
- 字段 label 从"邮箱"改成"邮箱或手机号"，`type="email"` 改成 `type="text"`（手机号不是合法的 `email` 类型），`autoComplete` 改成 `"username"`（同时兼容邮箱和手机号自动填充，`email`/`tel` 二选一都不准确）。
- 提交前先判断输入是邮箱还是手机号（用新写的 `isLikelyEmail`/`isLikelyPhone`），据此分别校验和构造传给 `authService.signUp` 的 `email`/`phone` 参数：
  - 是邮箱：跟现在一样，`email` 直接用输入值，`phone` 不传。
  - 是手机号：`phone` 传归一化后的数字，`email` 传 `phoneToShadowEmail(digits)`。
  - 两种都不像：报错"请输入正确的邮箱或手机号"。
- `register-validation.ts` 的 `validateRegisterInput` 需要相应调整（见下）。
- `FRIENDLY_ERROR_MESSAGES` 里 `email_exists`/`user_already_exists` 的文案要改成通用的"该邮箱或手机号已经注册，请直接登录或使用找回密码。"（手机号注册走的影子邮箱命中的也是这两个错误码，不能只提"邮箱"）。

### 5. `src/pages/register/register-validation.ts`
`RegisterFormInput`/`RegisterFormData` 的 `email` 字段语义不变（外部调用方还是传"用户输入的原始邮箱或手机号字符串"），内部改成：
- 先判断 `isLikelyEmail`/`isLikelyPhone`，都不是就返回校验失败（文案改成"请输入正确的邮箱或手机号。"，错误码可以保留原名，或者改成更准确的名字，Codex 自己判断哪个更清楚）。
- 返回的 `RegisterFormData` 建议加一个可选的 `phone` 字段（归一化后的数字，手机号路径才有），`email` 字段固定放"最终要传给 Supabase 的那个 email"（邮箱路径是原样，手机号路径是算出来的影子邮箱）——这样 `register-page.tsx` 不需要自己再判断一次，直接把 `validation.data` 传给 `authService.signUp` 就行。

### 6. `src/pages/login/login-page.tsx`
同样的字段 label/type/autoComplete 改法。提交时判断输入是邮箱还是手机号：
- 是邮箱：`authService.signIn({ email: trimmedInput, password })`，跟现在一样。
- 是手机号：`authService.signIn({ email: phoneToShadowEmail(normalizePhoneDigits(trimmedInput)), password })`。
- 都不像：报错"请输入正确的邮箱或手机号"，不发请求。
`FRIENDLY_ERROR_MESSAGES` 里 `invalid_credentials`/`user_not_found` 的文案现在已经是"邮箱或密码不正确"这种通用文案了，不用改。

## 明确不做的事
- 不做短信验证码/OTP——BARRY 已经明确这轮不做。
- 不支持"忘记密码"走手机号找回——`forgot-password-page.tsx`/`authService.resetPassword` 目前是真实发邮件，手机号注册用户的影子邮箱收不到邮件。这次**不改这个页面**，手机号注册用户暂时没有自助找回密码的路径，这是已知的、有意为之的缺口，以后要做短信找回再单独立卡。
- 不在 `edit-profile-page.tsx`/任何"我的"页面展示或允许编辑手机号——`profiles.phone` 这次只在注册流程里写入，不建任何读取/展示/编辑它的 UI。
- 不改 `settings/delete-account-page.tsx` 的 `verifyCurrentPassword`——它用的是 `session.user.email`（不管是不是影子邮箱，Supabase session 里都有这个值），本来就能正常工作，不需要特殊处理。
- 不改 Supabase 项目的邮箱确认（email confirmation）开关——这次改动对邮箱用户和手机号用户是完全对称的，不引入新的后端配置依赖。

## 验证要求
- `npm run typecheck && npm run test && npm run build`，把完整输出贴出来。
- 补充测试覆盖：手机号格式判断（`isLikelyPhone`/`isLikelyEmail`/`normalizePhoneDigits`/`phoneToShadowEmail` 的单元测试）、注册页手机号路径（构造出正确的影子邮箱+正确写入 phone）、登录页手机号路径、两个页面"输入既不像邮箱也不像手机号"时的报错。
- 麻烦真跑一遍注册（用手机号）→ 退出登录 → 用同一个手机号登录，确认能登录成功；再跑一遍用同一个手机号重复注册，确认会报"已经注册"而不是允许注册两次。测试账号用完记得按老规矩清理。
- 不需要额外的 Supabase 迁移——`profiles.phone` 这一列已经在生产库加好了，这个 worktree 从最新 main 拉出来的时候应该已经带着更新过的 `database.generated.ts`。

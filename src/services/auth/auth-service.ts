import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../integrations/supabase/client";
import { createProfile } from "../../repositories/profiles-repository";
import { AppError } from "../../utils/app-error";

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

export interface SignInInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: User | null;
  session: Session | null;
}

export const authService = {
  async signUp(input: SignUpInput): Promise<AuthResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { display_name: input.displayName }
      }
    });

    if (error) {
      throw new AppError(error.message, error.code ?? "AUTH_SIGN_UP_FAILED", error);
    }

    if (data.user && data.session) {
      /**
       * RLS 要求 auth.uid() = id。项目开启邮箱验证时，signUp 成功后
       * session 会是 null（客户端此时还是匿名身份），插入会被拒绝，所以
       * 这个分支不会执行——这种情况下不在这里补建，交给 useAuthBootstrap
       * 在用户真正完成邮箱验证、登录进来拿到有效 session 时，用
       * ensureProfileExists 兜底补上（两处共用同一份 createProfile 插入
       * 逻辑，见 profiles-repository.ts）。
       */
      await createProfile({ id: data.user.id, displayName: input.displayName, phone: input.phone ?? null });
    }

    return { user: data.user, session: data.session };
  },

  async signIn(input: SignInInput): Promise<AuthResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword(input);

    if (error) {
      throw new AppError(error.message, error.code ?? "AUTH_SIGN_IN_FAILED", error);
    }

    return { user: data.user, session: data.session };
  },

  /**
   * 短信验证码登录任务卡：给手机号发验证码（Supabase Auth → Twilio Verify）。
   * 没注册过的号码会在验证通过时自动建账号，displayName 只对新账号生效
   * （写进 user_metadata，useAuthBootstrap 补建 profile 时读它）。
   * phone 必须是 E.164 格式（"+12025550123"），见 utils/phone-identity.ts。
   */
  async sendPhoneOtp(phone: string, displayName: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { data: { display_name: displayName } }
    });

    if (error) {
      throw new AppError(error.message, error.code ?? "AUTH_SEND_OTP_FAILED", error);
    }
  },

  /** 短信验证码登录任务卡：校验验证码，成功即登录（新号码同时完成注册）。 */
  async verifyPhoneOtp(phone: string, token: string): Promise<AuthResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });

    if (error) {
      throw new AppError(error.message, error.code ?? "AUTH_VERIFY_OTP_FAILED", error);
    }

    return { user: data.user, session: data.session };
  },

  /**
   * 短信验证码登录任务卡：手机号 + 密码登录。只有在"设置 → 登录密码"里
   * 设过密码的手机号账号才能用；短信注册的新账号默认没有密码。
   */
  async signInWithPhonePassword(phone: string, password: string): Promise<AuthResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ phone, password });

    if (error) {
      throw new AppError(error.message, error.code ?? "AUTH_SIGN_IN_FAILED", error);
    }

    return { user: data.user, session: data.session };
  },

  async signOut(): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new AppError(error.message, error.code ?? "AUTH_SIGN_OUT_FAILED", error);
    }
  },

  /**
   * "注销账号"流程用：在真正调用 request_account_deletion() 之前，先
   * 用当前登录邮箱 + 用户输入的密码走一次 signInWithPassword 确认密码
   * 正确——这是 Supabase 项目里没有专门的"确认密码"API 时的通用做法，
   * 跟 signIn() 是同一个底层调用，只是这里不关心返回的 session（当前
   * session 已经是登录态，成功与否只用来判断密码是否正确），失败时
   * 统一包一层 AUTH_REAUTH_FAILED，不透出 Supabase 原始错误码，避免
   * 调用方误判成别的密码相关错误分支。
   */
  async verifyCurrentPassword(email: string, password: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw new AppError("密码不正确，请重新输入。", "AUTH_REAUTH_FAILED", error);
    }
  },

  async resetPassword(email: string, redirectTo: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) {
      throw new AppError(
        error.message,
        error.code ?? "AUTH_RESET_PASSWORD_FAILED",
        error
      );
    }
  },

  async updatePassword(newPassword: string): Promise<User> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      throw new AppError(
        error.message,
        error.code ?? "AUTH_UPDATE_PASSWORD_FAILED",
        error
      );
    }
    if (!data.user) {
      throw new AppError("更新密码后无法读取用户信息。", "AUTH_USER_MISSING");
    }

    return data.user;
  }
};

export type AuthService = typeof authService;

import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../integrations/supabase/client";
import { createProfile } from "../../repositories/profiles-repository";
import { AppError } from "../../utils/app-error";

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
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
      await createProfile({ id: data.user.id, displayName: input.displayName });
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

  async signOut(): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new AppError(error.message, error.code ?? "AUTH_SIGN_OUT_FAILED", error);
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

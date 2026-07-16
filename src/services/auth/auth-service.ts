import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../integrations/supabase/client";
import type { TablesInsert } from "../../types/database.generated";
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

/**
 * 仅当 signUp 返回了可用 session 时才能调用：RLS 要求 auth.uid() = id，
 * 如果项目开启了邮箱验证，signUp 成功后 session 会是 null，此时客户端还是
 * 匿名身份，插入会被拒绝。这种情况下 profile 应该延后到用户完成邮箱验证、
 * 首次登录成功后再补建——当前 useAuthBootstrap 还没有这段逻辑，是已知缺口。
 */
async function createInitialProfile(
  user: User,
  displayName: string
): Promise<void> {
  const payload: TablesInsert<"profiles"> = {
    id: user.id,
    display_name: displayName,
    role: "user",
    account_status: "active"
  };
  const { error } = await getSupabaseClient().from("profiles").insert(payload);

  if (error) {
    throw new AppError(error.message, "PROFILE_CREATE_FAILED", error);
  }
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
      await createInitialProfile(data.user, input.displayName);
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

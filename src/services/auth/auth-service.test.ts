import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const { authMocks, insertMock, fromMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  const authMocks = {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn()
  };
  return { authMocks, insertMock, fromMock };
});

vi.mock("../../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: authMocks,
    from: fromMock
  })
}));

import { authService } from "./auth-service";

describe("authService", () => {
  beforeEach(() => {
    Object.values(authMocks).forEach((fn) => fn.mockReset());
    insertMock.mockReset();
    fromMock.mockClear();
  });

  describe("signUp", () => {
    it("creates a profile row when signUp returns an active session", async () => {
      authMocks.signUp.mockResolvedValue({
        data: {
          user: { id: "user-1" },
          session: { access_token: "token" }
        },
        error: null
      });
      insertMock.mockResolvedValue({ error: null });

      const result = await authService.signUp({
        email: "user@example.com",
        password: "password123",
        displayName: "小明"
      });

      expect(authMocks.signUp).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password123",
        options: { data: { display_name: "小明" } }
      });
      expect(fromMock).toHaveBeenCalledWith("profiles");
      expect(insertMock).toHaveBeenCalledWith({
        id: "user-1",
        display_name: "小明",
        role: "user",
        account_status: "active"
      });
      expect(result.user?.id).toBe("user-1");
    });

    it("skips the profile insert when signUp does not return a session (email confirmation pending)", async () => {
      authMocks.signUp.mockResolvedValue({
        data: { user: { id: "user-1" }, session: null },
        error: null
      });

      await authService.signUp({
        email: "user@example.com",
        password: "password123",
        displayName: "小明"
      });

      expect(insertMock).not.toHaveBeenCalled();
    });

    it("throws an AppError when Supabase signUp fails", async () => {
      authMocks.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "User already registered", code: "user_already_exists" }
      });

      await expect(
        authService.signUp({
          email: "user@example.com",
          password: "password123",
          displayName: "小明"
        })
      ).rejects.toMatchObject({ code: "user_already_exists" });
    });

    it("throws PROFILE_CREATE_FAILED when the profiles insert fails", async () => {
      authMocks.signUp.mockResolvedValue({
        data: { user: { id: "user-1" }, session: { access_token: "token" } },
        error: null
      });
      insertMock.mockResolvedValue({
        error: { message: "duplicate key", code: "23505" }
      });

      await expect(
        authService.signUp({
          email: "user@example.com",
          password: "password123",
          displayName: "小明"
        })
      ).rejects.toMatchObject({ code: "PROFILE_CREATE_FAILED" });
    });
  });

  describe("signIn", () => {
    it("returns the user and session on success", async () => {
      authMocks.signInWithPassword.mockResolvedValue({
        data: { user: { id: "user-1" }, session: { access_token: "token" } },
        error: null
      });

      const result = await authService.signIn({
        email: "user@example.com",
        password: "password123"
      });

      expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password123"
      });
      expect(result.user?.id).toBe("user-1");
    });

    it("throws an AppError on invalid credentials", async () => {
      authMocks.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials", code: "invalid_credentials" }
      });

      await expect(
        authService.signIn({ email: "user@example.com", password: "wrong" })
      ).rejects.toMatchObject({ code: "invalid_credentials" });
    });
  });

  describe("signOut", () => {
    it("resolves when Supabase succeeds", async () => {
      authMocks.signOut.mockResolvedValue({ error: null });

      await expect(authService.signOut()).resolves.toBeUndefined();
    });

    it("throws an AppError when Supabase fails", async () => {
      authMocks.signOut.mockResolvedValue({
        error: { message: "network error", code: "request_timeout" }
      });

      await expect(authService.signOut()).rejects.toMatchObject({
        code: "request_timeout"
      });
    });
  });

  describe("resetPassword", () => {
    it("calls resetPasswordForEmail with the redirect URL", async () => {
      authMocks.resetPasswordForEmail.mockResolvedValue({ error: null });

      await authService.resetPassword("user@example.com", "https://saminest.com/reset");

      expect(authMocks.resetPasswordForEmail).toHaveBeenCalledWith(
        "user@example.com",
        { redirectTo: "https://saminest.com/reset" }
      );
    });
  });

  describe("updatePassword", () => {
    it("returns the updated user", async () => {
      authMocks.updateUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null
      });

      const user = await authService.updatePassword("newpassword123");

      expect(user.id).toBe("user-1");
    });

    it("throws AUTH_USER_MISSING when no user comes back", async () => {
      authMocks.updateUser.mockResolvedValue({ data: { user: null }, error: null });

      await expect(authService.updatePassword("newpassword123")).rejects.toMatchObject({
        code: "AUTH_USER_MISSING"
      });
    });
  });
});

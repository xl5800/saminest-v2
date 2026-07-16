import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, navigateMock, triggerAuthEvent } = vi.hoisted(() => {
  let capturedCallback: ((event: string, session: unknown) => void) | null = null;
  const onAuthStateChange = vi.fn(
    (callback: (event: string, session: unknown) => void) => {
      capturedCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }
  );
  const getSession = vi.fn(() => Promise.resolve({ data: { session: null } }));
  const signInWithPassword = vi.fn();
  const triggerAuthEvent = (event: string, session: unknown) => {
    capturedCallback?.(event, session);
  };
  return {
    authMock: { signInWithPassword, getSession, onAuthStateChange },
    navigateMock: vi.fn(),
    triggerAuthEvent
  };
});

vi.mock("../../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: authMock })
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthBootstrap } from "../../app/use-auth-bootstrap";
import { useAuthStore } from "../../store/auth-store";
import { LoginPage } from "./login-page";

const initialAuthState = useAuthStore.getState();

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    authMock.signInWithPassword.mockReset();
    authMock.onAuthStateChange.mockClear();
    authMock.getSession.mockClear();
    navigateMock.mockReset();
    useAuthStore.setState(initialAuthState, true);
  });

  it("renders the email and password fields plus a link to /register", () => {
    renderLoginPage();

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去注册" })).toHaveAttribute(
      "href",
      "/register"
    );
  });

  it("blocks submission and shows a friendly message when fields are empty", async () => {
    renderLoginPage();

    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请填写邮箱和密码。");
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows a loading label while signing in", async () => {
    let resolveSignIn: (value: unknown) => void = () => {};
    authMock.signInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      })
    );

    renderLoginPage();
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    const pendingButton = await screen.findByRole("button", { name: "登录中…" });
    expect(pendingButton).toBeDisabled();

    resolveSignIn({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("signs in and redirects home on success", async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null
    });

    renderLoginPage();
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(authMock.signInWithPassword).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password123"
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  it("shows a friendly message for invalid credentials instead of the raw Supabase error", async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" }
    });

    renderLoginPage();
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong-password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("邮箱或密码不正确，请重新输入。");
    expect(alert.textContent).not.toContain("Invalid login credentials");
  });

  it("falls back to a generic message for an unmapped error code", async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "boom", code: "some_unmapped_code" }
    });

    renderLoginPage();
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("登录失败，请稍后重试。");
  });

  it("updates the shared auth store session through the existing single auth listener after sign-in", async () => {
    const session = { access_token: "token", user: { id: "user-1" } };
    authMock.signInWithPassword.mockImplementation(async () => {
      triggerAuthEvent("SIGNED_IN", session);
      return { data: { user: session.user, session }, error: null };
    });

    function Harness() {
      useAuthBootstrap();
      return <LoginPage />;
    }

    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(useAuthStore.getState().isInitializing).toBe(false);
    });

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@example.com" }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(useAuthStore.getState().session).toEqual(session);
    });
  });
});

import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ForgotPasswordPage } from "../pages/forgot-password/forgot-password-page";
import { HomePage } from "../pages/home/home-page";
import { LoginPage } from "../pages/login/login-page";
import { NotFoundPage } from "../pages/not-found/not-found-page";
import { RegisterPage } from "../pages/register/register-page";
import { ResetPasswordPage } from "../pages/reset-password/reset-password-page";

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <HomePage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      { path: "*", element: <NotFoundPage /> }
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

describe("app routes", () => {
  it("renders the home page at /", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { name: "Saminest" })).toBeInTheDocument();
  });

  it("renders the login page at /login", () => {
    renderAt("/login");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the register page at /register", () => {
    renderAt("/register");

    expect(
      screen.getByRole("heading", { name: "注册 Saminest 账号" })
    ).toBeInTheDocument();
  });

  it("renders the forgot-password page at /forgot-password", () => {
    renderAt("/forgot-password");

    expect(
      screen.getByRole("heading", { name: "找回密码" })
    ).toBeInTheDocument();
  });

  it("renders the reset-password page at /reset-password", () => {
    renderAt("/reset-password");

    expect(
      screen.getByRole("heading", { name: "重置密码" })
    ).toBeInTheDocument();
  });

  it("renders the not-found page for an unknown path", () => {
    renderAt("/does-not-exist");

    expect(screen.getByRole("heading", { name: "页面未找到" })).toBeInTheDocument();
  });
});

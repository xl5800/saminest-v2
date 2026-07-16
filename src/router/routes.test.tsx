import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveCategories, listApprovedPosts } = vi.hoisted(() => ({
  listActiveCategories: vi.fn(),
  listApprovedPosts: vi.fn()
}));

vi.mock("../repositories/categories-repository", () => ({
  listActiveCategories
}));
vi.mock("../repositories/posts-repository", () => ({
  listApprovedPosts
}));

import { CategoryPage } from "../pages/category/category-page";
import { ForgotPasswordPage } from "../pages/forgot-password/forgot-password-page";
import { HomePage } from "../pages/home/home-page";
import { LoginPage } from "../pages/login/login-page";
import { NotFoundPage } from "../pages/not-found/not-found-page";
import { PostDetailPage } from "../pages/post/post-detail-page";
import { RegisterPage } from "../pages/register/register-page";
import { ResetPasswordPage } from "../pages/reset-password/reset-password-page";

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const router = createMemoryRouter(
    [
      { path: "/", element: <HomePage /> },
      { path: "/category/:slug", element: <CategoryPage /> },
      { path: "/post/:id", element: <PostDetailPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      { path: "*", element: <NotFoundPage /> }
    ],
    { initialEntries: [path] }
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe("app routes", () => {
  beforeEach(() => {
    listActiveCategories.mockReset();
    listApprovedPosts.mockReset();
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });
  });

  it("renders the home page at /", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { name: "Saminest" })).toBeInTheDocument();
  });

  it("renders the category page at /category/:slug", async () => {
    renderAt("/category/rent");

    expect(
      await screen.findByRole("heading", { name: "租房" })
    ).toBeInTheDocument();
  });

  it("renders the post detail placeholder at /post/:id", () => {
    renderAt("/post/post-1");

    expect(screen.getByRole("heading", { name: "帖子详情" })).toBeInTheDocument();
    expect(screen.getByText("帖子 ID：post-1")).toBeInTheDocument();
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

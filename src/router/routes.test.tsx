import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listActiveCategories,
  listActiveLocations,
  listApprovedPosts,
  listPendingPosts,
  createPost,
  listMessages,
  sendMessage,
  listMyConversations,
  listReportsForModeration,
  getCurrentUserRole
} = vi.hoisted(() => ({
  listActiveCategories: vi.fn(),
  listActiveLocations: vi.fn(),
  listApprovedPosts: vi.fn(),
  listPendingPosts: vi.fn(),
  createPost: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  listMyConversations: vi.fn(),
  listReportsForModeration: vi.fn(),
  getCurrentUserRole: vi.fn()
}));

vi.mock("../repositories/categories-repository", () => ({
  listActiveCategories
}));
vi.mock("../repositories/locations-repository", () => ({
  listActiveLocations
}));
vi.mock("../repositories/posts-repository", () => ({
  listApprovedPosts,
  listPendingPosts,
  createPost
}));
vi.mock("../repositories/messages-repository", () => ({
  listMessages,
  sendMessage
}));
vi.mock("../repositories/conversations-repository", () => ({
  listMyConversations
}));
vi.mock("../repositories/reports-repository", async () => {
  const actual = await vi.importActual<typeof import("../repositories/reports-repository")>(
    "../repositories/reports-repository"
  );
  return {
    ...actual,
    listReportsForModeration
  };
});
vi.mock("../repositories/profiles-repository", () => ({
  getCurrentUserRole
}));

import { AdminPendingPostsPage } from "../pages/admin/pending-posts-page";
import { AdminReportsPage } from "../pages/admin/reports-page";
import { CategoryPage } from "../pages/category/category-page";
import { ForgotPasswordPage } from "../pages/forgot-password/forgot-password-page";
import { HomePage } from "../pages/home/home-page";
import { LoginPage } from "../pages/login/login-page";
import { ConversationListPage } from "../pages/messages/conversation-list-page";
import { MessageConversationPage } from "../pages/messages/conversation-page";
import { NotFoundPage } from "../pages/not-found/not-found-page";
import { PostDetailPage } from "../pages/post/post-detail-page";
import { PublishPage } from "../pages/publish/publish-page";
import { RegisterPage } from "../pages/register/register-page";
import { ReportPostPage } from "../pages/report/report-post-page";
import { ResetPasswordPage } from "../pages/reset-password/reset-password-page";
import { RequireAdmin } from "./require-admin";
import { RequireAuth } from "./require-auth";
import { useAuthStore } from "../store/auth-store";

const initialAuthState = useAuthStore.getState();

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const router = createMemoryRouter(
    [
      { path: "/", element: <HomePage /> },
      { path: "/category/:slug", element: <CategoryPage /> },
      { path: "/post/:id", element: <PostDetailPage /> },
      {
        path: "/publish",
        element: (
          <RequireAuth>
            <PublishPage />
          </RequireAuth>
        )
      },
      {
        path: "/post/:id/report",
        element: (
          <RequireAuth>
            <ReportPostPage />
          </RequireAuth>
        )
      },
      {
        path: "/messages",
        element: (
          <RequireAuth>
            <ConversationListPage />
          </RequireAuth>
        )
      },
      {
        path: "/messages/:conversationId",
        element: (
          <RequireAuth>
            <MessageConversationPage />
          </RequireAuth>
        )
      },
      {
        path: "/admin/posts",
        element: (
          <RequireAuth>
            <RequireAdmin>
              <AdminPendingPostsPage />
            </RequireAdmin>
          </RequireAuth>
        )
      },
      {
        path: "/admin/reports",
        element: (
          <RequireAuth>
            <RequireAdmin>
              <AdminReportsPage />
            </RequireAdmin>
          </RequireAuth>
        )
      },
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
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    listActiveCategories.mockReset();
    listActiveLocations.mockReset();
    listApprovedPosts.mockReset();
    listPendingPosts.mockReset();
    createPost.mockReset();
    listMessages.mockReset();
    sendMessage.mockReset();
    listMyConversations.mockReset();
    listReportsForModeration.mockReset();
    getCurrentUserRole.mockReset();
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listActiveLocations.mockResolvedValue([{ id: "loc-1", name: "Rockville" }]);
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });
    listPendingPosts.mockResolvedValue([]);
    listMessages.mockResolvedValue([]);
    listMyConversations.mockResolvedValue([]);
    listReportsForModeration.mockResolvedValue([]);
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

  it("redirects /publish to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/publish");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the publish form at /publish when a session exists", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderAt("/publish");

    expect(screen.getByRole("heading", { name: "发布帖子" })).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "租房" })
    ).toBeInTheDocument();
  });

  it("redirects /post/:id/report to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/post/post-1/report");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the report form at /post/:id/report when a session exists", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderAt("/post/post-1/report");

    expect(screen.getByRole("heading", { name: "举报帖子" })).toBeInTheDocument();
  });

  it("redirects /messages to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/messages");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the conversation list page at /messages when a session exists", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderAt("/messages");

    expect(await screen.findByRole("heading", { name: "消息" })).toBeInTheDocument();
  });

  it("redirects /messages/:conversationId to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/messages/conversation-1");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the conversation page at /messages/:conversationId when a session exists", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderAt("/messages/conversation-1");

    expect(await screen.findByRole("heading", { name: "会话" })).toBeInTheDocument();
  });

  it("redirects /admin/posts to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/admin/posts");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("redirects /admin/posts to / when logged in as a non-admin (reuses RequireAdmin)", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("user");

    renderAt("/admin/posts");

    expect(
      await screen.findByRole("heading", { name: "Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the pending posts admin page at /admin/posts when logged in as an admin", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("admin");

    renderAt("/admin/posts");

    expect(
      await screen.findByRole("heading", { name: "待审核帖子" })
    ).toBeInTheDocument();
  });

  it("redirects /admin/reports to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/admin/reports");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("redirects /admin/reports to / when logged in as a non-admin (reuses RequireAdmin)", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("user");

    renderAt("/admin/reports");

    expect(
      await screen.findByRole("heading", { name: "Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the reports admin page at /admin/reports when logged in as an admin", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("super_admin");

    renderAt("/admin/reports");

    expect(
      await screen.findByRole("heading", { name: "举报处理" })
    ).toBeInTheDocument();
  });
});

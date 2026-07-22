import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listActiveCategories,
  listAllCategoriesForAdmin,
  listActiveLocations,
  listApprovedPosts,
  listPendingPosts,
  listAllPosts,
  listMyPosts,
  createPost,
  getPostDetail,
  listMessages,
  sendMessage,
  listMyConversations,
  listReportsForModeration,
  getCurrentUserRole,
  listProfilesForAdmin,
  getMyProfile,
  listFavoritedPostIds,
  listFavoritedPosts
} = vi.hoisted(() => ({
  listActiveCategories: vi.fn(),
  listAllCategoriesForAdmin: vi.fn(),
  listActiveLocations: vi.fn(),
  listApprovedPosts: vi.fn(),
  listPendingPosts: vi.fn(),
  listAllPosts: vi.fn(),
  listMyPosts: vi.fn(),
  createPost: vi.fn(),
  getPostDetail: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  listMyConversations: vi.fn(),
  listReportsForModeration: vi.fn(),
  getCurrentUserRole: vi.fn(),
  listProfilesForAdmin: vi.fn(),
  getMyProfile: vi.fn(),
  listFavoritedPostIds: vi.fn(),
  listFavoritedPosts: vi.fn()
}));

vi.mock("../repositories/categories-repository", () => ({
  listActiveCategories,
  listAllCategoriesForAdmin
}));
vi.mock("../repositories/locations-repository", () => ({
  listActiveLocations
}));
vi.mock("../repositories/posts-repository", () => ({
  listApprovedPosts,
  listPendingPosts,
  listAllPosts,
  listMyPosts,
  createPost,
  getPostDetail
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
  getCurrentUserRole,
  listProfilesForAdmin,
  getMyProfile
}));
vi.mock("../repositories/favorites-repository", () => ({
  listFavoritedPostIds,
  listFavoritedPosts
}));

import { AppShell } from "../components/app-shell";
import { AdminAllPostsPage } from "../pages/admin/all-posts-page";
import { AdminCategoriesPage } from "../pages/admin/categories-page";
import { AdminPendingPostsPage } from "../pages/admin/pending-posts-page";
import { AdminReportsPage } from "../pages/admin/reports-page";
import { AdminUsersPage } from "../pages/admin/users-page";
import { CategoriesPage } from "../pages/categories/categories-page";
import { CategoryPage } from "../pages/category/category-page";
import { FavoritesPage } from "../pages/favorites/favorites-page";
import { ForgotPasswordPage } from "../pages/forgot-password/forgot-password-page";
import { HomePage } from "../pages/home/home-page";
import { LoginPage } from "../pages/login/login-page";
import { ConversationListPage } from "../pages/messages/conversation-list-page";
import { MessageConversationPage } from "../pages/messages/conversation-page";
import { MyPostsPage } from "../pages/my-posts/my-posts-page";
import { NotFoundPage } from "../pages/not-found/not-found-page";
import { PostDetailPage } from "../pages/post/post-detail-page";
import { ProfilePage } from "../pages/profile/profile-page";
import { PublishPage } from "../pages/publish/publish-page";
import { RegisterPage } from "../pages/register/register-page";
import { ReportPostPage } from "../pages/report/report-post-page";
import { ResetPasswordPage } from "../pages/reset-password/reset-password-page";
import { RequireAdmin } from "./require-admin";
import { RequireAuth } from "./require-auth";
import { useAuthStore } from "../store/auth-store";

const initialAuthState = useAuthStore.getState();

function renderAt(path: string | string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const initialEntries = Array.isArray(path) ? path : [path];
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "category/:slug", element: <CategoryPage /> },
          { path: "categories", element: <CategoriesPage /> },
          { path: "post/:id", element: <PostDetailPage /> },
          {
            path: "publish",
            element: (
              <RequireAuth>
                <PublishPage />
              </RequireAuth>
            )
          },
          {
            path: "post/:id/report",
            element: (
              <RequireAuth>
                <ReportPostPage />
              </RequireAuth>
            )
          },
          {
            path: "messages",
            element: (
              <RequireAuth>
                <ConversationListPage />
              </RequireAuth>
            )
          },
          {
            path: "messages/:conversationId",
            element: (
              <RequireAuth>
                <MessageConversationPage />
              </RequireAuth>
            )
          },
          {
            path: "favorites",
            element: (
              <RequireAuth>
                <FavoritesPage />
              </RequireAuth>
            )
          },
          {
            path: "profile",
            element: (
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            )
          },
          {
            path: "my-posts",
            element: (
              <RequireAuth>
                <MyPostsPage />
              </RequireAuth>
            )
          },
          {
            path: "admin/posts",
            element: (
              <RequireAuth>
                <RequireAdmin>
                  <AdminPendingPostsPage />
                </RequireAdmin>
              </RequireAuth>
            )
          },
          {
            path: "admin/posts/all",
            element: (
              <RequireAuth>
                <RequireAdmin>
                  <AdminAllPostsPage />
                </RequireAdmin>
              </RequireAuth>
            )
          },
          {
            path: "admin/reports",
            element: (
              <RequireAuth>
                <RequireAdmin>
                  <AdminReportsPage />
                </RequireAdmin>
              </RequireAuth>
            )
          },
          {
            path: "admin/users",
            element: (
              <RequireAuth>
                <RequireAdmin>
                  <AdminUsersPage />
                </RequireAdmin>
              </RequireAuth>
            )
          },
          {
            path: "admin/categories",
            element: (
              <RequireAuth>
                <RequireAdmin>
                  <AdminCategoriesPage />
                </RequireAdmin>
              </RequireAuth>
            )
          },
          { path: "login", element: <LoginPage /> },
          { path: "register", element: <RegisterPage /> },
          { path: "forgot-password", element: <ForgotPasswordPage /> },
          { path: "reset-password", element: <ResetPasswordPage /> },
          { path: "*", element: <NotFoundPage /> }
        ]
      }
    ],
    { initialEntries, initialIndex: initialEntries.length - 1 }
  );
  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { ...renderResult, router };
}

describe("app routes", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    listActiveCategories.mockReset();
    listAllCategoriesForAdmin.mockReset();
    listActiveLocations.mockReset();
    listApprovedPosts.mockReset();
    listPendingPosts.mockReset();
    listAllPosts.mockReset();
    createPost.mockReset();
    getPostDetail.mockReset();
    listMessages.mockReset();
    sendMessage.mockReset();
    listMyConversations.mockReset();
    listReportsForModeration.mockReset();
    getCurrentUserRole.mockReset();
    listProfilesForAdmin.mockReset();
    getMyProfile.mockReset();
    listFavoritedPostIds.mockReset();
    listFavoritedPosts.mockReset();
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listAllCategoriesForAdmin.mockResolvedValue([]);
    listActiveLocations.mockResolvedValue([{ id: "loc-1", name: "Rockville" }]);
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });
    getPostDetail.mockResolvedValue(null);
    listPendingPosts.mockResolvedValue([]);
    listAllPosts.mockResolvedValue([]);
    listMessages.mockResolvedValue([]);
    listMyConversations.mockResolvedValue([]);
    listReportsForModeration.mockResolvedValue([]);
    listProfilesForAdmin.mockResolvedValue([]);
    getMyProfile.mockResolvedValue({ displayName: "Alice" });
    listFavoritedPostIds.mockResolvedValue([]);
    listFavoritedPosts.mockResolvedValue([]);
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

  it("renders the categories page at /categories", async () => {
    renderAt("/categories");

    expect(
      await screen.findByRole("heading", { name: "分类" })
    ).toBeInTheDocument();
  });

  it("renders the post detail page at /post/:id (not-found state when the post doesn't resolve)", async () => {
    renderAt("/post/post-1");

    expect(
      await screen.findByRole("heading", { name: "帖子未找到" })
    ).toBeInTheDocument();
    expect(getPostDetail).toHaveBeenCalledWith("post-1");
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
    expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "对方" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "底部导航" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "发布" })).not.toBeInTheDocument();
  });

  it("restores the conversation list chrome when the in-page back button handles a direct detail URL", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderAt("/messages/conversation-1");
    fireEvent.click(await screen.findByRole("button", { name: "返回" }));

    expect(await screen.findByRole("heading", { name: "消息" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
  });

  it("restores the conversation list chrome after browser history returns from a conversation", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    listMyConversations.mockResolvedValue([
      {
        id: "conversation-1",
        postId: "post-1",
        postTitle: "木桌",
        otherPartyRole: "seller",
        lastActivityAt: "2026-07-20T12:00:00.000Z"
      }
    ]);

    const { router } = renderAt("/messages");
    fireEvent.click(await screen.findByRole("link", { name: /卖家/ }));

    expect(await screen.findByRole("heading", { name: "卖家" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "底部导航" })).not.toBeInTheDocument();

    await act(async () => {
      await router.navigate(-1);
    });

    expect(await screen.findByRole("heading", { name: "消息" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
  });

  it("redirects /favorites to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/favorites");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the favorites page at /favorites when a session exists", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderAt("/favorites");

    expect(await screen.findByRole("heading", { name: "我的收藏" })).toBeInTheDocument();
  });

  it("redirects /profile to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/profile");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the profile page at /profile when a session exists", async () => {
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "alice@example.com" }
    } as never);
    getCurrentUserRole.mockResolvedValue("user");

    renderAt("/profile");

    expect(await screen.findByRole("heading", { name: "我的" })).toBeInTheDocument();
  });

  it("redirects /my-posts to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/my-posts");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the my-posts page at /my-posts when a session exists", async () => {
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "alice@example.com" }
    } as never);
    listMyPosts.mockResolvedValue([]);

    renderAt("/my-posts");

    expect(await screen.findByRole("heading", { name: "我的发布" })).toBeInTheDocument();
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

  it("redirects /admin/posts/all to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/admin/posts/all");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("redirects /admin/posts/all to / when logged in as a non-admin (reuses RequireAdmin)", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("user");

    renderAt("/admin/posts/all");

    expect(
      await screen.findByRole("heading", { name: "Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the all posts admin page at /admin/posts/all when logged in as an admin", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("admin");

    renderAt("/admin/posts/all");

    expect(
      await screen.findByRole("heading", { name: "全部帖子" })
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

  it("redirects /admin/users to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/admin/users");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("redirects /admin/users to / when logged in as a non-admin (reuses RequireAdmin)", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("user");

    renderAt("/admin/users");

    expect(
      await screen.findByRole("heading", { name: "Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the users admin page at /admin/users when logged in as an admin", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("admin");

    renderAt("/admin/users");

    expect(
      await screen.findByRole("heading", { name: "账号管理" })
    ).toBeInTheDocument();
  });

  it("redirects /admin/categories to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/admin/categories");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("redirects /admin/categories to / when logged in as a non-admin (reuses RequireAdmin)", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("user");

    renderAt("/admin/categories");

    expect(
      await screen.findByRole("heading", { name: "Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the categories admin page at /admin/categories when logged in as an admin", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("admin");

    renderAt("/admin/categories");

    expect(
      await screen.findByRole("heading", { name: "分类管理" })
    ).toBeInTheDocument();
  });
});

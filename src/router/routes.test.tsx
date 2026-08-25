import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listActiveCategories,
  listAllCategoriesForAdmin,
  listActiveLocations,
  listActiveActivityRegions,
  listActiveCitiesWithState,
  listRegionContentCounts,
  listApprovedPosts,
  listPendingPosts,
  listAllPosts,
  listMyPosts,
  createPost,
  getPostDetail,
  listMessages,
  sendMessage,
  markConversationAsRead,
  hasUnreadSystemNotification,
  listMyConversations,
  listReportsForModeration,
  listFeedbackForAdmin,
  getCurrentUserRole,
  listProfilesForAdmin,
  getMyProfile,
  updateMyProfile,
  updateMyAvatarUrl,
  getPublicProfile,
  createProfileConversation,
  listFavoritedPostIds,
  listFavoritedPosts,
  listActivities,
  getActivityDetail,
  createActivity,
  listMyOrganizedActivities,
  listMyJoinedActivities,
  listMyBlockedUsers
} = vi.hoisted(() => ({
  listActiveCategories: vi.fn(),
  listAllCategoriesForAdmin: vi.fn(),
  listActiveLocations: vi.fn(),
  listActiveActivityRegions: vi.fn(),
  listActiveCitiesWithState: vi.fn(),
  listRegionContentCounts: vi.fn(),
  listApprovedPosts: vi.fn(),
  listPendingPosts: vi.fn(),
  listAllPosts: vi.fn(),
  listMyPosts: vi.fn(),
  createPost: vi.fn(),
  getPostDetail: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  markConversationAsRead: vi.fn(),
  hasUnreadSystemNotification: vi.fn(),
  listMyConversations: vi.fn(),
  listReportsForModeration: vi.fn(),
  listFeedbackForAdmin: vi.fn(),
  getCurrentUserRole: vi.fn(),
  listProfilesForAdmin: vi.fn(),
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  updateMyAvatarUrl: vi.fn(),
  getPublicProfile: vi.fn(),
  createProfileConversation: vi.fn(),
  listFavoritedPostIds: vi.fn(),
  listFavoritedPosts: vi.fn(),
  listActivities: vi.fn(),
  getActivityDetail: vi.fn(),
  createActivity: vi.fn(),
  listMyOrganizedActivities: vi.fn(),
  listMyJoinedActivities: vi.fn(),
  listMyBlockedUsers: vi.fn()
}));

vi.mock("../repositories/categories-repository", () => ({
  listActiveCategories,
  listAllCategoriesForAdmin
}));
vi.mock("../repositories/locations-repository", () => ({
  listActiveLocations,
  listActiveActivityRegions,
  listActiveCitiesWithState,
  listRegionContentCounts
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
  listMyConversations,
  createProfileConversation,
  markConversationAsRead,
  hasUnreadSystemNotification
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
vi.mock("../repositories/feedback-repository", async () => {
  const actual = await vi.importActual<typeof import("../repositories/feedback-repository")>(
    "../repositories/feedback-repository"
  );
  return {
    ...actual,
    listFeedbackForAdmin
  };
});
vi.mock("../repositories/profiles-repository", () => ({
  getCurrentUserRole,
  listProfilesForAdmin,
  getMyProfile,
  updateMyProfile,
  updateMyAvatarUrl,
  getPublicProfile
}));
vi.mock("../repositories/favorites-repository", () => ({
  listFavoritedPostIds,
  listFavoritedPosts
}));
vi.mock("../repositories/activities-repository", async () => {
  const actual = await vi.importActual<typeof import("../repositories/activities-repository")>(
    "../repositories/activities-repository"
  );
  return {
    ...actual,
    listActivities,
    getActivityDetail,
    createActivity,
    listMyOrganizedActivities,
    listMyJoinedActivities
  };
});
// 13 号卡新增的 /blocked-users 路由会真的触发 listMyBlockedUsers（不像
// 别的路由测试场景里屏蔽相关 hook 大多因为 enabled 条件不满足而根本不会
// 发起请求），跟其它几个用 importActual 合并的 mock 是同一个理由——只
// 覆盖这一个函数，isBlockingUser/blockUser/unblockUser/isBlockedWithUser
// 保留真实实现，不影响其它已有路由测试里对这个模块的既有行为。
vi.mock("../repositories/user-blocks-repository", async () => {
  const actual = await vi.importActual<typeof import("../repositories/user-blocks-repository")>(
    "../repositories/user-blocks-repository"
  );
  return {
    ...actual,
    listMyBlockedUsers
  };
});

import { AppShell } from "../components/app-shell";
import { ActivityDetailPage } from "../pages/activities/activity-detail-page";
import { ActivityListPage } from "../pages/activities/activity-list-page";
import { CreateActivityPage } from "../pages/activities/create-activity-page";
import { AdminAllPostsPage } from "../pages/admin/all-posts-page";
import { AdminCategoriesPage } from "../pages/admin/categories-page";
import { AdminFeedbackPage } from "../pages/admin/feedback-page";
import { AdminPendingPostsPage } from "../pages/admin/pending-posts-page";
import { AdminReportsPage } from "../pages/admin/reports-page";
import { AdminUsersPage } from "../pages/admin/users-page";
import { CategoriesPage } from "../pages/categories/categories-page";
import { FavoritesPage } from "../pages/favorites/favorites-page";
import { SubmitFeedbackPage } from "../pages/feedback/submit-feedback-page";
import { ForgotPasswordPage } from "../pages/forgot-password/forgot-password-page";
import { HomePage } from "../pages/home/home-page";
import { LoginPage } from "../pages/login/login-page";
import { ConversationListPage } from "../pages/messages/conversation-list-page";
import { MessageConversationPage } from "../pages/messages/conversation-page";
import { MyActivitiesPage } from "../pages/my-activities/my-activities-page";
import { MyPostsPage } from "../pages/my-posts/my-posts-page";
import { NotFoundPage } from "../pages/not-found/not-found-page";
import { PostDetailPage } from "../pages/post/post-detail-page";
import { PrivacyPage } from "../pages/privacy/privacy-page";
import { BlockedUsersPage } from "../pages/profile/blocked-users-page";
import { EditProfilePage } from "../pages/profile/edit-profile-page";
import { ProfilePage } from "../pages/profile/profile-page";
import { UserProfilePage } from "../pages/profile/user-profile-page";
import { PublishPage } from "../pages/publish/publish-page";
import { RegionSelectPage } from "../pages/region-select/region-select-page";
import { RegisterPage } from "../pages/register/register-page";
import { ReportActivityPage } from "../pages/report/report-activity-page";
import { ReportPostPage } from "../pages/report/report-post-page";
import { ReportUserPage } from "../pages/report/report-user-page";
import { ResetPasswordPage } from "../pages/reset-password/reset-password-page";
import { TermsPage } from "../pages/terms/terms-page";
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
          { path: "activities", element: <ActivityListPage /> },
          {
            path: "activities/new",
            element: (
              <RequireAuth>
                <CreateActivityPage />
              </RequireAuth>
            )
          },
          { path: "activities/:id", element: <ActivityDetailPage /> },
          {
            path: "activities/:id/report",
            element: (
              <RequireAuth>
                <ReportActivityPage />
              </RequireAuth>
            )
          },
          { path: "categories", element: <CategoriesPage /> },
          { path: "region-select", element: <RegionSelectPage /> },
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
            path: "blocked-users",
            element: (
              <RequireAuth>
                <BlockedUsersPage />
              </RequireAuth>
            )
          },
          {
            path: "feedback",
            element: (
              <RequireAuth>
                <SubmitFeedbackPage />
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
            path: "profile/edit",
            element: (
              <RequireAuth>
                <EditProfilePage />
              </RequireAuth>
            )
          },
          { path: "users/:userId", element: <UserProfilePage /> },
          {
            path: "users/:userId/report",
            element: (
              <RequireAuth>
                <ReportUserPage />
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
            path: "my-activities",
            element: (
              <RequireAuth>
                <MyActivitiesPage />
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
            path: "admin/feedback",
            element: (
              <RequireAuth>
                <RequireAdmin>
                  <AdminFeedbackPage />
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
          { path: "terms", element: <TermsPage /> },
          { path: "privacy", element: <PrivacyPage /> },
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
    listActiveActivityRegions.mockReset();
    listActiveCitiesWithState.mockReset();
    listRegionContentCounts.mockReset();
    listApprovedPosts.mockReset();
    listPendingPosts.mockReset();
    listAllPosts.mockReset();
    createPost.mockReset();
    getPostDetail.mockReset();
    listMessages.mockReset();
    sendMessage.mockReset();
    markConversationAsRead.mockReset();
    hasUnreadSystemNotification.mockReset();
    listMyConversations.mockReset();
    listReportsForModeration.mockReset();
    listFeedbackForAdmin.mockReset();
    getCurrentUserRole.mockReset();
    listProfilesForAdmin.mockReset();
    getMyProfile.mockReset();
    updateMyProfile.mockReset();
    updateMyAvatarUrl.mockReset();
    getPublicProfile.mockReset();
    createProfileConversation.mockReset();
    listFavoritedPostIds.mockReset();
    listFavoritedPosts.mockReset();
    listActivities.mockReset();
    getActivityDetail.mockReset();
    createActivity.mockReset();
    listMyOrganizedActivities.mockReset();
    listMyJoinedActivities.mockReset();
    listMyBlockedUsers.mockReset();
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listAllCategoriesForAdmin.mockResolvedValue([]);
    listActiveLocations.mockResolvedValue([{ id: "loc-1", name: "Rockville" }]);
    listActiveActivityRegions.mockResolvedValue([{ id: "region-1", name: "VA", stateCode: "VA" }]);
    listActiveCitiesWithState.mockResolvedValue([
      { id: "loc-1", name: "Rockville", stateCode: "VA" }
    ]);
    listRegionContentCounts.mockResolvedValue(new Map());
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });
    getPostDetail.mockResolvedValue(null);
    listPendingPosts.mockResolvedValue([]);
    listAllPosts.mockResolvedValue([]);
    listMessages.mockResolvedValue([]);
    markConversationAsRead.mockResolvedValue(undefined);
    hasUnreadSystemNotification.mockResolvedValue(false);
    listMyConversations.mockResolvedValue([]);
    listReportsForModeration.mockResolvedValue([]);
    listFeedbackForAdmin.mockResolvedValue([]);
    listProfilesForAdmin.mockResolvedValue([]);
    getMyProfile.mockResolvedValue({
      displayName: "Alice",
      avatarUrl: null,
      bio: null,
      locationId: null,
      locationName: null
    });
    getPublicProfile.mockResolvedValue(null);
    listFavoritedPostIds.mockResolvedValue([]);
    listFavoritedPosts.mockResolvedValue([]);
    listActivities.mockResolvedValue([]);
    getActivityDetail.mockResolvedValue(null);
    listMyOrganizedActivities.mockResolvedValue([]);
    listMyJoinedActivities.mockResolvedValue([]);
    listMyBlockedUsers.mockResolvedValue([]);
  });

  it("renders the home page at /", () => {
    renderAt("/");

    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });

  // 03 号卡（category-tab）：独立的 /category/:slug 分类下钻页已经退役，
  // 分类筛选态统一收进首页的 ?category=<slug> 查询参数，见下面
  // "renders the home page filtered by ?category=" 这个测试。
  it("navigates to the home feed filtered by ?category=<slug> when a category tile is clicked at /categories", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderAt("/categories");

    fireEvent.click(await screen.findByRole("link", { name: "租房" }));

    expect(await screen.findByTestId("home-page")).toBeInTheDocument();
    await waitFor(() => {
      expect(listApprovedPosts).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "cat-1" })
      );
    });
  });

  it("renders the categories page at /categories", async () => {
    renderAt("/categories");

    expect(
      await screen.findByRole("heading", { name: "分类" })
    ).toBeInTheDocument();
  });

  it("renders the home page pre-filtered when landing directly on /?category=<slug>", async () => {
    listApprovedPosts.mockResolvedValue({ posts: [], hasNextPage: false });

    renderAt("/?category=rent");

    expect(screen.getByTestId("home-page")).toBeInTheDocument();
    await waitFor(() => {
      expect(listApprovedPosts).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "cat-1" })
      );
    });
  });

  it("renders the region-select page at /region-select without requiring a session", async () => {
    renderAt("/region-select");

    expect(
      await screen.findByRole("heading", { name: "地区选择" })
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
  });

  it("renders the post detail page at /post/:id (not-found state when the post doesn't resolve)", async () => {
    renderAt("/post/post-1");

    expect(
      await screen.findByRole("heading", { name: "帖子未找到" })
    ).toBeInTheDocument();
    expect(getPostDetail).toHaveBeenCalledWith("post-1");
  });

  it("renders the activity list page at /activities without requiring a session", async () => {
    renderAt("/activities");

    // 14 号卡改版：居中的"找搭子"标题换成了 TopBar home 变体的"Saminest"
    // 品牌胶囊（不再有任何居中大标题），见 activity-list-page.tsx。
    expect(await screen.findByText("Saminest")).toBeInTheDocument();
  });

  it("renders the activity detail page at /activities/:id (not-found state when the activity doesn't resolve)", async () => {
    renderAt("/activities/act-1");

    expect(
      await screen.findByRole("heading", { name: "活动未找到" })
    ).toBeInTheDocument();
    expect(getActivityDetail).toHaveBeenCalledWith("act-1");
  });

  it("redirects /activities/new to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/activities/new");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the create-activity form at /activities/new when a session exists", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderAt("/activities/new");

    // 04 号卡改版：顶部 TopBar create 变体的标题从旧版"发起一起去"换成了
    // "发布搭子内容"。12 号卡起，地区字段不再是原生 <select>，改成跳转
    // /region-select?mode=form 的一行按钮，默认展示"请选择州"占位文案。
    expect(screen.getByRole("heading", { name: "发布搭子内容" })).toBeInTheDocument();
    expect(await screen.findByText("请选择州")).toBeInTheDocument();
  });

  it("redirects /activities/:id/report to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/activities/act-1/report");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the report-activity form at /activities/:id/report when a session exists (P0 activity reporting)", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderAt("/activities/act-1/report");

    expect(screen.getByRole("heading", { name: "举报活动" })).toBeInTheDocument();
  });

  it("renders the login page at /login without the global header/bottom nav chrome", () => {
    renderAt("/login");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "发布" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "底部导航" })).not.toBeInTheDocument();
  });

  it("renders the register page at /register without the global header/bottom nav chrome", () => {
    renderAt("/register");

    expect(
      screen.getByRole("heading", { name: "注册 Saminest 账号" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "发布" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "底部导航" })).not.toBeInTheDocument();
  });

  it("renders the forgot-password page at /forgot-password without the global header/bottom nav chrome", () => {
    renderAt("/forgot-password");

    expect(
      screen.getByRole("heading", { name: "找回密码" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "发布" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "底部导航" })).not.toBeInTheDocument();
  });

  it("renders the reset-password page at /reset-password without the global header/bottom nav chrome", () => {
    renderAt("/reset-password");

    expect(
      screen.getByRole("heading", { name: "重置密码" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "发布" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "底部导航" })).not.toBeInTheDocument();
  });

  it("renders the terms page at /terms without requiring a session", () => {
    renderAt("/terms");

    expect(screen.getByRole("heading", { name: "用户协议" })).toBeInTheDocument();
  });

  it("renders the privacy page at /privacy without requiring a session", () => {
    renderAt("/privacy");

    expect(screen.getByRole("heading", { name: "隐私政策" })).toBeInTheDocument();
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
        originType: "post",
        otherUserId: "seller-1",
        otherDisplayName: "Bob",
        otherAvatarUrl: null,
        lastActivityAt: "2026-07-20T12:00:00.000Z"
      }
    ]);

    const { router } = renderAt("/messages");
    // 头像/昵称现在各自是指向 /users/:id 的独立链接，点进会话本体要用
    // conversation-link 这个 testid（帖子标题+时间那部分），不能再靠
    // 昵称文字 "Bob" 找链接——那个链接现在指向的是公开个人主页。
    fireEvent.click(await screen.findByTestId("conversation-link"));

    expect(await screen.findByRole("heading", { name: "Bob" })).toBeInTheDocument();
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

  // 13 号卡（"我的"页新增"已屏蔽"管理入口）。
  it("redirects /blocked-users to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/blocked-users");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the blocked-users page at /blocked-users when a session exists", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderAt("/blocked-users");

    expect(await screen.findByRole("heading", { name: "已屏蔽" })).toBeInTheDocument();
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

  it("redirects /profile/edit to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/profile/edit");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the edit-profile page at /profile/edit when a session exists", async () => {
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "alice@example.com" }
    } as never);

    renderAt("/profile/edit");

    expect(await screen.findByRole("heading", { name: "编辑资料" })).toBeInTheDocument();
  });

  it("renders the public user-profile page at /users/:userId without requiring a session", async () => {
    getPublicProfile.mockResolvedValue({
      id: "user-2",
      displayName: "Bob",
      bio: null,
      avatarUrl: null,
      locationName: null
    });

    renderAt("/users/user-2");

    expect(await screen.findByRole("heading", { name: "Bob" })).toBeInTheDocument();
  });

  it("redirects /users/:userId/report to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/users/user-2/report");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the report-user form at /users/:userId/report when a session exists (UGC 安全功能补齐任务卡 2)", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderAt("/users/user-2/report");

    expect(screen.getByRole("heading", { name: "举报用户" })).toBeInTheDocument();
  });

  it("redirects /feedback to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/feedback");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the submit-feedback page at /feedback when a session exists", async () => {
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "alice@example.com" }
    } as never);

    renderAt("/feedback");

    expect(await screen.findByRole("heading", { name: "联系客服" })).toBeInTheDocument();
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

  it("redirects /my-activities to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/my-activities");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("renders the my-activities page at /my-activities when a session exists", async () => {
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "alice@example.com" }
    } as never);

    renderAt("/my-activities");

    expect(await screen.findByRole("heading", { name: "我的活动" })).toBeInTheDocument();
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
      await screen.findByTestId("home-page")
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
      await screen.findByTestId("home-page")
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
      await screen.findByTestId("home-page")
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

  it("redirects /admin/feedback to /login when there is no session (reuses RequireAuth)", () => {
    renderAt("/admin/feedback");

    expect(
      screen.getByRole("heading", { name: "登录 Saminest" })
    ).toBeInTheDocument();
  });

  it("redirects /admin/feedback to / when logged in as a non-admin (reuses RequireAdmin)", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("user");

    renderAt("/admin/feedback");

    expect(
      await screen.findByTestId("home-page")
    ).toBeInTheDocument();
  });

  it("renders the feedback admin page at /admin/feedback when logged in as an admin", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    getCurrentUserRole.mockResolvedValue("super_admin");

    renderAt("/admin/feedback");

    expect(
      await screen.findByRole("heading", { name: "联系客服" })
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
      await screen.findByTestId("home-page")
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
      await screen.findByTestId("home-page")
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

import { createBrowserRouter } from "react-router-dom";

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
import { NotFoundPage } from "../pages/not-found/not-found-page";
import { PostDetailPage } from "../pages/post/post-detail-page";
import { ProfilePage } from "../pages/profile/profile-page";
import { PublishPage } from "../pages/publish/publish-page";
import { RegisterPage } from "../pages/register/register-page";
import { ReportPostPage } from "../pages/report/report-post-page";
import { ResetPasswordPage } from "../pages/reset-password/reset-password-page";
import { RequireAdmin } from "./require-admin";
import { RequireAuth } from "./require-auth";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: "category/:slug",
        element: <CategoryPage />
      },
      {
        path: "categories",
        element: <CategoriesPage />
      },
      {
        path: "post/:id",
        element: <PostDetailPage />
      },
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
      {
        path: "login",
        element: <LoginPage />
      },
      {
        path: "register",
        element: <RegisterPage />
      },
      {
        path: "forgot-password",
        element: <ForgotPasswordPage />
      },
      {
        path: "reset-password",
        element: <ResetPasswordPage />
      },
      {
        path: "*",
        element: <NotFoundPage />
      }
    ]
  }
]);

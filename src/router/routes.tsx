import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "../components/app-shell";
import { ActivityDetailPage } from "../pages/activities/activity-detail-page";
import { ActivityListPage } from "../pages/activities/activity-list-page";
import { CreateActivityPage } from "../pages/activities/create-activity-page";
import { AdminAllPostsPage } from "../pages/admin/all-posts-page";
import { AdminCategoriesPage } from "../pages/admin/categories-page";
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
import { EditProfilePage } from "../pages/profile/edit-profile-page";
import { ProfilePage } from "../pages/profile/profile-page";
import { UserProfilePage } from "../pages/profile/user-profile-page";
import { PublishPage } from "../pages/publish/publish-page";
import { RegionSelectPage } from "../pages/region-select/region-select-page";
import { RegisterPage } from "../pages/register/register-page";
import { ReportActivityPage } from "../pages/report/report-activity-page";
import { ReportPostPage } from "../pages/report/report-post-page";
import { ResetPasswordPage } from "../pages/reset-password/reset-password-page";
import { TermsPage } from "../pages/terms/terms-page";
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
        path: "activities",
        element: <ActivityListPage />
      },
      {
        path: "activities/new",
        element: (
          <RequireAuth>
            <CreateActivityPage />
          </RequireAuth>
        )
      },
      {
        path: "activities/:id",
        element: <ActivityDetailPage />
      },
      {
        path: "activities/:id/report",
        element: (
          <RequireAuth>
            <ReportActivityPage />
          </RequireAuth>
        )
      },
      {
        // 03 号卡（category-tab）：独立的 /category/:slug 分类下钻页已经
        // 退役——分类筛选态统一收进首页的 ?category=<slug> 查询参数，见
        // categories-page.tsx / home-page.tsx / category-nav.tsx 的改动。
        path: "categories",
        element: <CategoriesPage />
      },
      {
        // 06 号卡：地区选择页，从首页顶部州名点击进入（见 home-page.tsx 的
        // REGION_SELECT_PATH），公开可见、不需要登录——跟 categories 同样
        // 是纯浏览型的二级导航页，选中的地区写进纯前端的
        // useSelectedRegionStore，不涉及需要鉴权的数据写入。
        path: "region-select",
        element: <RegionSelectPage />
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
        // 编辑帖子复用同一个 PublishPage（阶段六）：组件内部按有没有 :id
        // 参数区分新建/编辑两种模式，编辑模式下挂载时用 getPostDetail(:id)
        // 回填表单字段，提交时调用 updatePost() 而不是 createPost()，
        // 详见 publish-page.tsx 顶部注释。
        path: "publish/:id",
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
      {
        path: "users/:userId",
        element: <UserProfilePage />
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
        path: "terms",
        element: <TermsPage />
      },
      {
        path: "privacy",
        element: <PrivacyPage />
      },
      {
        path: "*",
        element: <NotFoundPage />
      }
    ]
  }
]);

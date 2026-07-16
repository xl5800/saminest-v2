import { createBrowserRouter } from "react-router-dom";

import { CategoryPage } from "../pages/category/category-page";
import { ForgotPasswordPage } from "../pages/forgot-password/forgot-password-page";
import { HomePage } from "../pages/home/home-page";
import { LoginPage } from "../pages/login/login-page";
import { NotFoundPage } from "../pages/not-found/not-found-page";
import { PostDetailPage } from "../pages/post/post-detail-page";
import { PublishPage } from "../pages/publish/publish-page";
import { RegisterPage } from "../pages/register/register-page";
import { ResetPasswordPage } from "../pages/reset-password/reset-password-page";
import { RequireAuth } from "./require-auth";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />
  },
  {
    path: "/category/:slug",
    element: <CategoryPage />
  },
  {
    path: "/post/:id",
    element: <PostDetailPage />
  },
  {
    path: "/publish",
    element: (
      <RequireAuth>
        <PublishPage />
      </RequireAuth>
    )
  },
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/register",
    element: <RegisterPage />
  },
  {
    path: "/forgot-password",
    element: <ForgotPasswordPage />
  },
  {
    path: "/reset-password",
    element: <ResetPasswordPage />
  },
  {
    path: "*",
    element: <NotFoundPage />
  }
]);

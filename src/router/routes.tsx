import { createBrowserRouter } from "react-router-dom";

import { HomePage } from "../pages/home/home-page";
import { LoginPage } from "../pages/login/login-page";
import { NotFoundPage } from "../pages/not-found/not-found-page";
import { RegisterPage } from "../pages/register/register-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />
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
    path: "*",
    element: <NotFoundPage />
  }
]);

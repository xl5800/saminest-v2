import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "../store/auth-store";
import { RequireAuth } from "./require-auth";

const initialState = useAuthStore.getState();

beforeEach(() => {
  useAuthStore.setState(initialState, true);
});

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/protected",
        element: (
          <RequireAuth>
            <div>受保护内容</div>
          </RequireAuth>
        )
      },
      { path: "/login", element: <div>登录页</div> }
    ],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("RequireAuth", () => {
  it("redirects to /login when there is no session", () => {
    renderAt("/protected");

    expect(screen.getByText("登录页")).toBeInTheDocument();
  });

  // 注册登录简化任务卡：跳登录页时带上来源页，登录成功后回来。
  it("carries the protected path (with its query) in the redirect param", () => {
    const router = renderAt("/protected?tab=1");

    expect(router.state.location.pathname).toBe("/login");
    expect(new URLSearchParams(router.state.location.search).get("redirect")).toBe("/protected?tab=1");
  });

  it("renders the children when a session exists", () => {
    useAuthStore.getState().setSession({ access_token: "token" } as never);

    renderAt("/protected");

    expect(screen.getByText("受保护内容")).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserRole } = vi.hoisted(() => ({
  getCurrentUserRole: vi.fn()
}));

vi.mock("../repositories/profiles-repository", () => ({
  getCurrentUserRole
}));

import { RequireAdmin } from "./require-admin";
import { useAuthStore } from "../store/auth-store";

const initialAuthState = useAuthStore.getState();

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const router = createMemoryRouter(
    [
      { path: "/", element: <p>首页</p> },
      {
        path: "/admin/secret",
        element: (
          <RequireAdmin>
            <p>管理员内容</p>
          </RequireAdmin>
        )
      }
    ],
    { initialEntries: [path] }
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe("RequireAdmin", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    getCurrentUserRole.mockReset();
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
  });

  it("shows a loading state while the admin check is pending", () => {
    getCurrentUserRole.mockReturnValue(new Promise(() => {}));

    renderAt("/admin/secret");

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("redirects to / when the current user's role is not admin", async () => {
    getCurrentUserRole.mockResolvedValue("user");

    renderAt("/admin/secret");

    expect(await screen.findByText("首页")).toBeInTheDocument();
  });

  it("renders children when the current user's role is admin", async () => {
    getCurrentUserRole.mockResolvedValue("admin");

    renderAt("/admin/secret");

    expect(await screen.findByText("管理员内容")).toBeInTheDocument();
  });

  it("renders children when the current user's role is super_admin", async () => {
    getCurrentUserRole.mockResolvedValue("super_admin");

    renderAt("/admin/secret");

    expect(await screen.findByText("管理员内容")).toBeInTheDocument();
  });

  it("fails closed: redirects to / when the role query errors", async () => {
    getCurrentUserRole.mockRejectedValue(new Error("network down"));

    renderAt("/admin/secret");

    expect(await screen.findByText("首页")).toBeInTheDocument();
  });
});

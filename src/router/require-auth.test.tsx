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
  return render(<RouterProvider router={router} />);
}

describe("RequireAuth", () => {
  it("redirects to /login when there is no session", () => {
    renderAt("/protected");

    expect(screen.getByText("登录页")).toBeInTheDocument();
  });

  it("renders the children when a session exists", () => {
    useAuthStore.getState().setSession({ access_token: "token" } as never);

    renderAt("/protected");

    expect(screen.getByText("受保护内容")).toBeInTheDocument();
  });
});

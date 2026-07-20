import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { AppHeader } from "./app-header";

function renderAt(entries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <>
            <AppHeader />
            <p>首页内容</p>
          </>
        )
      },
      {
        path: "/category/:slug",
        element: (
          <>
            <AppHeader />
            <p>分类页内容</p>
          </>
        )
      }
    ],
    { initialEntries: entries }
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe("AppHeader", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render a back button on /", () => {
    renderAt(["/"]);

    expect(screen.queryByRole("button", { name: "返回" })).not.toBeInTheDocument();
  });

  it("renders a working back button on a non-/ route", async () => {
    renderAt(["/", "/category/rent"]);

    const backButton = await screen.findByRole("button", { name: "返回" });
    fireEvent.click(backButton);

    expect(await screen.findByText("首页内容")).toBeInTheDocument();
  });

  it("renders the brand link pointing at /", () => {
    renderAt(["/"]);

    expect(screen.getByRole("link", { name: "Saminest" })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it("renders 发布/收藏/消息/我的 links with the correct hrefs", () => {
    renderAt(["/"]);

    expect(screen.getByRole("link", { name: "发布" })).toHaveAttribute(
      "href",
      "/publish"
    );
    expect(screen.getByRole("link", { name: "收藏" })).toHaveAttribute(
      "href",
      "/favorites"
    );
    expect(screen.getByRole("link", { name: "消息" })).toHaveAttribute(
      "href",
      "/messages"
    );
    expect(screen.getByRole("link", { name: "我的" })).toHaveAttribute(
      "href",
      "/profile"
    );
  });
});

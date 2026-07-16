import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Location } from "react-router-dom";

import { renderWithProviders } from "../../test/render-with-providers";
import { PostDetailPage } from "./post-detail-page";

function renderAtWithState(path: string, state: unknown) {
  const entry: Partial<Location> = { pathname: path, state };
  return render(
    <MemoryRouter initialEntries={[entry as never]}>
      <Routes>
        <Route path="/post/:id" element={<PostDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PostDetailPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the post id from the route and a placeholder status", () => {
    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.getByRole("heading", { name: "帖子详情" })).toBeInTheDocument();
    expect(screen.getByText("帖子 ID：post-1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "详情页正在建设中，敬请期待。"
    );
  });

  it("shows the publish success message from navigation state instead of the placeholder", () => {
    renderAtWithState("/post/post-999", {
      publishSuccessMessage: "发布成功，等待审核"
    });

    expect(screen.getByText("帖子 ID：post-999")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("发布成功，等待审核");
  });
});

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/render-with-providers";
import { PostDetailPage } from "./post-detail-page";

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
});

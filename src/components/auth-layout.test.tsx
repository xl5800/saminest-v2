import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { AuthLayout } from "./auth-layout";

describe("AuthLayout", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a back button and the centered Saminest wordmark, with no 发布 button", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthLayout>
          <p>page content</p>
        </AuthLayout>
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Saminest" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "发布" })).not.toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});

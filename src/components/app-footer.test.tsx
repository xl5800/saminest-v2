import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { AppFooter } from "./app-footer";

describe("AppFooter", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders links to 用户协议, 隐私政策, and 意见反馈 with the correct hrefs", () => {
    render(
      <MemoryRouter>
        <AppFooter />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "用户协议" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "隐私政策" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "意见反馈" })).toHaveAttribute("href", "/feedback");
  });
});

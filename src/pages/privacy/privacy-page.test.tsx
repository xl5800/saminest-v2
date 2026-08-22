import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PrivacyPage } from "./privacy-page";

describe("PrivacyPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the title and last-updated date", () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "隐私政策", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Last Updated / 最后更新：2026-07-09")).toBeInTheDocument();
  });

  it("links the feedback mention in 联系我们 to the real /feedback route", () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "联系客服（Feedback）" })).toHaveAttribute(
      "href",
      "/feedback"
    );
  });
});

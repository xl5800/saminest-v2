import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/render-with-providers";
import { SettingsPage } from "./settings-page";

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a link to the delete-account page", () => {
    renderWithProviders(<SettingsPage />);

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();

    const deleteLink = screen.getByRole("link", { name: /注销账号/ });
    expect(deleteLink).toHaveAttribute("href", "/settings/delete-account");
  });
});

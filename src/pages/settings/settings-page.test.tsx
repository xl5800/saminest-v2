import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signOut, navigateMock } = vi.hoisted(() => ({ signOut: vi.fn(), navigateMock: vi.fn() }));

vi.mock("../../services/auth/auth-service", () => ({
  authService: { signOut }
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { renderWithProviders } from "../../test/render-with-providers";
import { SettingsPage } from "./settings-page";

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    signOut.mockReset();
    navigateMock.mockReset();
  });

  it("renders a link to the delete-account page", () => {
    renderWithProviders(<SettingsPage />);

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();

    const deleteLink = screen.getByRole("link", { name: /注销账号/ });
    expect(deleteLink).toHaveAttribute("href", "/settings/delete-account");
  });

  // 我的页改版：退出登录从"我的"页挪到这里。
  it("signs out and goes home from 退出登录", async () => {
    signOut.mockResolvedValue(undefined);
    renderWithProviders(<SettingsPage />);

    const button = screen.getByRole("button", { name: "退出登录" });
    expect(button).toHaveClass("text-danger");
    fireEvent.click(button);

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/");
    });
  });

  it("shows an error and stays when signing out fails", async () => {
    signOut.mockRejectedValue(new Error("network down"));
    renderWithProviders(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("退出登录失败，请稍后重试。");
    expect(navigateMock).not.toHaveBeenCalledWith("/");
  });
});

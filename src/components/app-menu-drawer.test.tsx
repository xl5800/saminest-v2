import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { renderWithProviders } from "../test/render-with-providers";
import { AppMenuDrawer } from "./app-menu-drawer";

describe("AppMenuDrawer", () => {
  afterEach(() => cleanup());
  beforeEach(() => navigateMock.mockReset());

  it("shows the two entries: 我的社区 and 创建社区", () => {
    renderWithProviders(<AppMenuDrawer onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /我的社区/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /创建社区/ })).toBeInTheDocument();
  });

  it("我的社区 closes the menu and opens the 我的社区 tab of the community page", () => {
    const onClose = vi.fn();
    renderWithProviders(<AppMenuDrawer onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /我的社区/ }));

    expect(onClose).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/community?tab=mine");
  });

  it("创建社区 goes to /community/create", () => {
    renderWithProviders(<AppMenuDrawer onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /创建社区/ }));

    expect(navigateMock).toHaveBeenCalledWith("/community/create");
  });

  it("closes on the backdrop, the close button and Escape, but not when clicking inside the panel", () => {
    const onClose = vi.fn();
    renderWithProviders(<AppMenuDrawer onClose={onClose} />);

    fireEvent.click(screen.getByRole("navigation", { name: "菜单选项" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog", { name: "菜单" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭菜单" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

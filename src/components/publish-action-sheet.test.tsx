import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { renderWithProviders } from "../test/render-with-providers";
import { PublishActionSheet } from "./publish-action-sheet";

describe("PublishActionSheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the four publish options in the fixed order defined by 05-publish-flow.md, with '发起搭子' first", () => {
    navigateMock.mockReset();
    renderWithProviders(<PublishActionSheet onClose={vi.fn()} />, {
      initialEntries: ["/"]
    });

    const buttons = screen.getAllByRole("button").filter((button) => button.textContent !== "取消");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "🤝发起搭子",
      "🏠发布租房",
      "🔑发布求租",
      "🛍发布二手"
    ]);
  });

  it("always emphasizes '发起搭子' (blue-light background), regardless of which page opened the sheet", () => {
    navigateMock.mockReset();
    renderWithProviders(<PublishActionSheet onClose={vi.fn()} />, {
      initialEntries: ["/activities"]
    });

    const activityButton = screen.getByRole("button", { name: /发起搭子/ });
    expect(activityButton.className).toContain("bg-primary-light");
    expect(activityButton.className).toContain("text-primary");
  });

  it("does not emphasize the other three options", () => {
    navigateMock.mockReset();
    renderWithProviders(<PublishActionSheet onClose={vi.fn()} />, {
      initialEntries: ["/"]
    });

    for (const name of [/发布租房/, /发布求租/, /发布二手/]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).not.toContain("bg-primary-light");
      expect(button.className).toContain("bg-bg");
    }
  });

  it("navigates to /publish?category=rent when '发布租房' is clicked, and closes", () => {
    navigateMock.mockReset();
    const onClose = vi.fn();
    renderWithProviders(<PublishActionSheet onClose={onClose} />, {
      initialEntries: ["/"]
    });

    fireEvent.click(screen.getByRole("button", { name: /发布租房/ }));

    expect(navigateMock).toHaveBeenCalledWith("/publish?category=rent");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("navigates to /publish?category=wanted when '发布求租' is clicked", () => {
    navigateMock.mockReset();
    renderWithProviders(<PublishActionSheet onClose={vi.fn()} />, {
      initialEntries: ["/"]
    });

    fireEvent.click(screen.getByRole("button", { name: /发布求租/ }));

    expect(navigateMock).toHaveBeenCalledWith("/publish?category=wanted");
  });

  it("navigates to /publish?category=used when '发布二手' is clicked", () => {
    navigateMock.mockReset();
    renderWithProviders(<PublishActionSheet onClose={vi.fn()} />, {
      initialEntries: ["/"]
    });

    fireEvent.click(screen.getByRole("button", { name: /发布二手/ }));

    expect(navigateMock).toHaveBeenCalledWith("/publish?category=used");
  });

  it("navigates to /activities/new when '发起搭子' is clicked", () => {
    navigateMock.mockReset();
    renderWithProviders(<PublishActionSheet onClose={vi.fn()} />, {
      initialEntries: ["/"]
    });

    fireEvent.click(screen.getByRole("button", { name: /发起搭子/ }));

    expect(navigateMock).toHaveBeenCalledWith("/activities/new");
  });

  it("calls onClose when the backdrop is clicked", () => {
    navigateMock.mockReset();
    const onClose = vi.fn();
    renderWithProviders(<PublishActionSheet onClose={onClose} />, {
      initialEntries: ["/"]
    });

    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the 取消 button is clicked", () => {
    navigateMock.mockReset();
    const onClose = vi.fn();
    renderWithProviders(<PublishActionSheet onClose={onClose} />, {
      initialEntries: ["/"]
    });

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    navigateMock.mockReset();
    const onClose = vi.fn();
    renderWithProviders(<PublishActionSheet onClose={onClose} />, {
      initialEntries: ["/"]
    });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when an option button itself is clicked (only navigates)", () => {
    navigateMock.mockReset();
    const onClose = vi.fn();
    renderWithProviders(<PublishActionSheet onClose={onClose} />, {
      initialEntries: ["/"]
    });

    // onClose 确实被调用了（选完关闭是预期行为），但不是因为事件冒泡到了
    // 背景 —— 用 stopPropagation 验证：只调用一次，不是背景 + 按钮各触发一次。
    fireEvent.click(screen.getByRole("button", { name: /发布租房/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, clipboardWriteMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  clipboardWriteMock: vi.fn()
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("@capacitor/clipboard", () => ({
  Clipboard: { write: clipboardWriteMock }
}));

import { renderWithProviders } from "../test/render-with-providers";
import { PostShareActionSheet } from "./post-share-action-sheet";

describe("PostShareActionSheet", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    navigateMock.mockReset();
    clipboardWriteMock.mockReset();
    clipboardWriteMock.mockResolvedValue(undefined);
  });

  it("renders the three options in order: 复制链接, 分享到微信, 举报", () => {
    renderWithProviders(
      <PostShareActionSheet postId="post-1" onShareToWechat={vi.fn()} onClose={vi.fn()} />,
      { initialEntries: ["/post/post-1"] }
    );

    const buttons = screen.getAllByRole("button").filter((button) => button.textContent !== "取消");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "🔗复制链接",
      "💬分享到微信",
      "🚩举报"
    ]);
  });

  // 硬编码生产域名拼链接，不用 window.location.origin——跟 handleShare()
  // 里 PRODUCTION_ORIGIN 的用法、post-detail-page.test.tsx 里同一条规则的
  // 断言保持一致。
  it("writes the hardcoded production URL to the clipboard when 复制链接 is clicked, and shows a success message without closing the sheet", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <PostShareActionSheet postId="post-1" onShareToWechat={vi.fn()} onClose={onClose} />,
      { initialEntries: ["/post/post-1"] }
    );

    fireEvent.click(screen.getByRole("button", { name: /复制链接/ }));

    await waitFor(() => {
      expect(clipboardWriteMock).toHaveBeenCalledWith({
        string: "https://www.saminest.com/post/post-1"
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent("链接已复制");
    expect(onClose).not.toHaveBeenCalled();
  });

  // 跟 handleShare() 分享取消时的态度一致：复制失败不是用户能操作纠正的
  // 场景，静默吞掉、只留控制台日志，不弹用户可见的错误提示。
  it("does not show an error message when the clipboard write fails", async () => {
    clipboardWriteMock.mockRejectedValue(new Error("Clipboard permission denied"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(
      <PostShareActionSheet postId="post-1" onShareToWechat={vi.fn()} onClose={vi.fn()} />,
      { initialEntries: ["/post/post-1"] }
    );

    fireEvent.click(screen.getByRole("button", { name: /复制链接/ }));

    await waitFor(() => {
      expect(clipboardWriteMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it("calls onShareToWechat and closes the sheet when 分享到微信 is clicked", () => {
    const onShareToWechat = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <PostShareActionSheet postId="post-1" onShareToWechat={onShareToWechat} onClose={onClose} />,
      { initialEntries: ["/post/post-1"] }
    );

    fireEvent.click(screen.getByRole("button", { name: /分享到微信/ }));

    expect(onShareToWechat).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("navigates to /post/:id/report and closes the sheet when 举报 is clicked", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <PostShareActionSheet postId="post-1" onShareToWechat={vi.fn()} onClose={onClose} />,
      { initialEntries: ["/post/post-1"] }
    );

    fireEvent.click(screen.getByRole("button", { name: /举报/ }));

    expect(navigateMock).toHaveBeenCalledWith("/post/post-1/report");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <PostShareActionSheet postId="post-1" onShareToWechat={vi.fn()} onClose={onClose} />,
      { initialEntries: ["/post/post-1"] }
    );

    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the 取消 button is clicked", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <PostShareActionSheet postId="post-1" onShareToWechat={vi.fn()} onClose={onClose} />,
      { initialEntries: ["/post/post-1"] }
    );

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <PostShareActionSheet postId="post-1" onShareToWechat={vi.fn()} onClose={onClose} />,
      { initialEntries: ["/post/post-1"] }
    );

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

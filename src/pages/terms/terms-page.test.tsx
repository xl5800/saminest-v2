import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getOrCreateOwnSupportConversation, navigateMock } = vi.hoisted(() => ({
  getOrCreateOwnSupportConversation: vi.fn(),
  navigateMock: vi.fn()
}));

// 联系客服改成真聊天任务卡：跟 privacy-page.test.tsx 同一个道理，这个
// 页面现在也会用到 useContactSupport()（间接用到 useMutation），只 mock
// 底层仓库函数，不重复测 useContactSupport 本身的成功/失败分支（那套已经
// 在 profile-page.test.tsx 里覆盖过）。
vi.mock("../../repositories/conversations-repository", () => ({
  getOrCreateOwnSupportConversation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { TermsPage } from "./terms-page";

const initialAuthState = useAuthStore.getState();

describe("TermsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    // useContactSupport() 未登录会直接跳 /login、不调用仓库函数（见该
    // hook 的注释）——这里模拟一个已登录用户，才能测到真正点进客服会话
    // 的分支，见 privacy-page.test.tsx 同款注释。
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "alice@example.com" }
    } as never);
    getOrCreateOwnSupportConversation.mockReset();
    navigateMock.mockReset();
    getOrCreateOwnSupportConversation.mockResolvedValue({ conversationId: "conversation-1" });
  });

  it("renders the title and last-updated date", () => {
    renderWithProviders(<TermsPage />);

    expect(screen.getByRole("heading", { name: "用户协议", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Last Updated / 最后更新：2026-07-09")).toBeInTheDocument();
  });

  // 联系客服改成真聊天任务卡：这个入口从静态 <Link to="/feedback"> 换成了
  // useContactSupport() 驱动的 <button>，不再有 href 可断言——改成断言
  // "点击后确实调用了拿会话 id 的仓库函数，并跳到 /messages/:id"。
  it("clicking the 联系客服（Feedback） mention in 联系我们 opens the support conversation instead of navigating to the old /feedback form", async () => {
    renderWithProviders(<TermsPage />);

    const button = screen.getByRole("button", { name: "联系客服（Feedback）" });
    expect(button).not.toHaveAttribute("href");
    fireEvent.click(button);

    await waitFor(() => {
      expect(getOrCreateOwnSupportConversation).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/messages/conversation-1");
    });
  });
});

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getOrCreateOwnSupportConversation, navigateMock } = vi.hoisted(() => ({
  getOrCreateOwnSupportConversation: vi.fn(),
  navigateMock: vi.fn()
}));

// 联系客服改成真聊天任务卡：这个页面现在会调用 useContactSupport()（间接
// 用到 useMutation），只 mock 底层的仓库函数——不重复测 useContactSupport
// 本身的成功/失败分支逻辑（那套已经在 profile-page.test.tsx 里覆盖过），
// 这里只验证"点击这个按钮确实触发了它、且样式/位置符合预期"。
vi.mock("../../repositories/conversations-repository", () => ({
  getOrCreateOwnSupportConversation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { PrivacyPage } from "./privacy-page";

const initialAuthState = useAuthStore.getState();

describe("PrivacyPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    // useContactSupport() 未登录会直接跳 /login、不调用仓库函数（见该
    // hook 的注释）——这里模拟一个已登录用户，才能测到真正点进客服会话
    // 的分支，不是测未登录跳转（未登录分支在 useContactSupport 自己没有
    // 专门的单测，逻辑简单到跟 contact-seller-button.tsx 的同款判断一样
    // 直接信；这几个调用方页面只关心"登录后点击这个入口确实生效"）。
    useAuthStore.getState().setSession({
      user: { id: "user-1", email: "alice@example.com" }
    } as never);
    getOrCreateOwnSupportConversation.mockReset();
    navigateMock.mockReset();
    getOrCreateOwnSupportConversation.mockResolvedValue({ conversationId: "conversation-1" });
  });

  it("renders the title and last-updated date", () => {
    renderWithProviders(<PrivacyPage />);

    expect(screen.getByRole("heading", { name: "隐私政策", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Last Updated / 最后更新：2026-07-09")).toBeInTheDocument();
  });

  // 联系客服改成真聊天任务卡：这个入口从静态 <Link to="/feedback"> 换成了
  // useContactSupport() 驱动的 <button>，不再有 href 可断言——改成断言
  // "点击后确实调用了拿会话 id 的仓库函数，并跳到 /messages/:id"。
  it("clicking the 联系客服（Feedback） mention in 联系我们 opens the support conversation instead of navigating to the old /feedback form", async () => {
    renderWithProviders(<PrivacyPage />);

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

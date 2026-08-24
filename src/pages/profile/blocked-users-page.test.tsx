import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listMyBlockedUsers, unblockUser } = vi.hoisted(() => ({
  listMyBlockedUsers: vi.fn(),
  unblockUser: vi.fn()
}));

// 跟 favorites-page.test.tsx 是同一个理由：mock 到仓库函数这一层，不是
// mock useMyBlockedUsersQuery/useUnblockUserMutation 这两个 hook 本身——
// 这样测试跑的是真正的 TanStack Query 集成，"取消屏蔽成功后 invalidate
// 查询、列表自动少了这一行"这条验收标准才是真的被验证到，而不是靠 mock
// 掉的 hook 伪装出来的效果。
vi.mock("../../repositories/user-blocks-repository", () => ({
  listMyBlockedUsers,
  unblockUser
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { BlockedUsersPage } from "./blocked-users-page";

const initialAuthState = useAuthStore.getState();

describe("BlockedUsersPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    listMyBlockedUsers.mockReset();
    unblockUser.mockReset();
  });

  it("shows a loading state while the list is pending", () => {
    listMyBlockedUsers.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<BlockedUsersPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("shows an error message when the request fails", async () => {
    listMyBlockedUsers.mockRejectedValue(new Error("network down"));

    renderWithProviders(<BlockedUsersPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("加载失败，请稍后重试。");
  });

  it("shows an empty state when the user hasn't blocked anyone", async () => {
    listMyBlockedUsers.mockResolvedValue([]);

    renderWithProviders(<BlockedUsersPage />);

    expect(await screen.findByText("暂无屏蔽的用户")).toBeInTheDocument();
  });

  it("renders each blocked user's avatar/nickname linking to /users/:userId, with a 取消屏蔽 button", async () => {
    listMyBlockedUsers.mockResolvedValue([
      { blockedUserId: "user-2", displayName: "Bob", avatarUrl: "https://img.example.com/bob.jpg" },
      { blockedUserId: "user-3", displayName: "Carol", avatarUrl: null }
    ]);

    const { container } = renderWithProviders(<BlockedUsersPage />);

    const bobLink = await screen.findByRole("link", { name: "Bob" });
    expect(bobLink).toHaveAttribute("href", "/users/user-2");
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://img.example.com/bob.jpg"
    );

    const carolLink = screen.getByRole("link", { name: "Carol" });
    expect(carolLink).toHaveAttribute("href", "/users/user-3");
    // Carol 没有头像图，退化成昵称首字母占位。
    expect(screen.getByText("C")).toBeInTheDocument();

    expect(screen.getAllByRole("button", { name: "取消屏蔽" })).toHaveLength(2);
  });

  it("calls unblockUser with the current user as blocker, and removes the row from the list on success", async () => {
    listMyBlockedUsers.mockResolvedValue([
      { blockedUserId: "user-2", displayName: "Bob", avatarUrl: null }
    ]);
    unblockUser.mockResolvedValue(undefined);

    renderWithProviders(<BlockedUsersPage />);
    expect(await screen.findByText("Bob")).toBeInTheDocument();

    // 取消屏蔽之后，重新拉取到的列表里这个人应该已经不在了——跟
    // favorites-page.test.tsx 的 removeFavorite 测试是同一个验证方式。
    listMyBlockedUsers.mockResolvedValue([]);

    fireEvent.click(screen.getByRole("button", { name: "取消屏蔽" }));

    await waitFor(() => {
      expect(unblockUser).toHaveBeenCalledWith({ blockerId: "user-1", blockedId: "user-2" });
    });
    await waitFor(() => {
      expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("暂无屏蔽的用户")).toBeInTheDocument();
  });

  it("shows a row-level error and keeps the row when unblocking fails", async () => {
    listMyBlockedUsers.mockResolvedValue([
      { blockedUserId: "user-2", displayName: "Bob", avatarUrl: null }
    ]);
    unblockUser.mockRejectedValue(new Error("network down"));

    renderWithProviders(<BlockedUsersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "取消屏蔽" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("取消屏蔽失败，请稍后重试。");
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });
});

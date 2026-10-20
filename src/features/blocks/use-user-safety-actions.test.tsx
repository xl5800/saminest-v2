import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { blockUser, unblockUser, isBlockingUser } = vi.hoisted(() => ({
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  isBlockingUser: vi.fn()
}));

vi.mock("../../repositories/user-blocks-repository", () => ({ blockUser, unblockUser, isBlockingUser }));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { useUserSafetyActions } from "./use-user-safety-actions";

const initialAuthState = useAuthStore.getState();

function Harness({ targetUserId }: { targetUserId: string }) {
  const safety = useUserSafetyActions(targetUserId, "小兔");
  return (
    <div>
      <div data-testid="menu">{safety.menuItems}</div>
      {safety.statusMessage}
      {safety.confirmSheet}
    </div>
  );
}

describe("useUserSafetyActions", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useAuthStore.setState({ ...initialAuthState, session: { user: { id: "me" } } as never });
    blockUser.mockReset();
    unblockUser.mockReset();
    isBlockingUser.mockReset();
    isBlockingUser.mockResolvedValue(false);
  });

  it("offers 举报用户 and 屏蔽此人, and blocks after confirming", async () => {
    blockUser.mockResolvedValue(undefined);
    renderWithProviders(<Harness targetUserId="other" />);

    expect(screen.getByRole("link", { name: "举报用户" })).toHaveAttribute("href", "/users/other/report");
    fireEvent.click(await screen.findByRole("button", { name: "屏蔽此人" }));
    expect(screen.getByRole("dialog", { name: "屏蔽此人" })).toHaveTextContent("屏蔽 小兔？");

    fireEvent.click(screen.getByRole("button", { name: "屏蔽" }));
    await waitFor(() => expect(blockUser).toHaveBeenCalledWith({ blockerId: "me", blockedId: "other" }));
    expect(await screen.findByText("已屏蔽 小兔，你不会再看到对方发布的内容。")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("unblocks right away when already blocked", async () => {
    isBlockingUser.mockResolvedValue(true);
    unblockUser.mockResolvedValue(undefined);
    renderWithProviders(<Harness targetUserId="other" />);

    fireEvent.click(await screen.findByRole("button", { name: "取消屏蔽" }));
    await waitFor(() => expect(unblockUser).toHaveBeenCalledWith({ blockerId: "me", blockedId: "other" }));
  });

  it("offers nothing for your own content or when logged out", () => {
    renderWithProviders(<Harness targetUserId="me" />);
    expect(screen.getByTestId("menu")).toBeEmptyDOMElement();
    cleanup();

    useAuthStore.setState({ ...initialAuthState, session: null });
    renderWithProviders(<Harness targetUserId="other" />);
    expect(screen.getByTestId("menu")).toBeEmptyDOMElement();
  });
});

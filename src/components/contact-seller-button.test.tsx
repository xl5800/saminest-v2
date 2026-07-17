import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  usePostAuthorQuery,
  useCreateDirectConversationMutation,
  navigateMock,
  mutateMock
} = vi.hoisted(() => ({
  usePostAuthorQuery: vi.fn(),
  useCreateDirectConversationMutation: vi.fn(),
  navigateMock: vi.fn(),
  mutateMock: vi.fn()
}));

vi.mock("../features/posts/use-post-author-query", () => ({
  usePostAuthorQuery
}));
vi.mock("../features/conversations/use-create-direct-conversation-mutation", () => ({
  useCreateDirectConversationMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../store/auth-store";
import { renderWithProviders } from "../test/render-with-providers";
import { ContactSellerButton } from "./contact-seller-button";

const initialAuthState = useAuthStore.getState();

describe("ContactSellerButton", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    navigateMock.mockReset();
    mutateMock.mockReset();
    usePostAuthorQuery.mockReset();
    useCreateDirectConversationMutation.mockReset();

    usePostAuthorQuery.mockReturnValue({ data: "author-1", isSuccess: true });
    useCreateDirectConversationMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: false
    });
  });

  it("renders nothing while the post author query has not resolved yet", () => {
    usePostAuthorQuery.mockReturnValue({ data: undefined, isSuccess: false });

    renderWithProviders(<ContactSellerButton postId="post-1" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when the current viewer is the post's own author", () => {
    useAuthStore.getState().setSession({ user: { id: "author-1" } } as never);
    usePostAuthorQuery.mockReturnValue({ data: "author-1", isSuccess: true });

    renderWithProviders(<ContactSellerButton postId="post-1" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the button when the viewer is not the post's author", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePostAuthorQuery.mockReturnValue({ data: "author-1", isSuccess: true });

    renderWithProviders(<ContactSellerButton postId="post-1" />);

    expect(
      screen.getByRole("button", { name: "联系发布者" })
    ).toBeInTheDocument();
  });

  it("navigates to /login and does not call the mutation when logged out", () => {
    renderWithProviders(<ContactSellerButton postId="post-1" />);

    fireEvent.click(screen.getByRole("button", { name: "联系发布者" }));

    expect(navigateMock).toHaveBeenCalledWith("/login");
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("calls the mutation with the postId and navigates to the conversation on success", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderWithProviders(<ContactSellerButton postId="post-1" />);

    fireEvent.click(screen.getByRole("button", { name: "联系发布者" }));

    expect(mutateMock).toHaveBeenCalledWith(
      "post-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function)
      })
    );

    const { onSuccess } = mutateMock.mock.calls[0][1];
    onSuccess({ conversationId: "conversation-1" });

    expect(navigateMock).toHaveBeenCalledWith("/messages/conversation-1");
  });

  it("shows an inline error message and does not navigate when the mutation fails", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderWithProviders(<ContactSellerButton postId="post-1" />);

    fireEvent.click(screen.getByRole("button", { name: "联系发布者" }));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(new Error("cannot start a direct conversation with yourself"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "会话创建失败，请稍后重试。"
    );
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/messages\//)
    );
  });

  it("disables the button while the mutation is pending, preventing a double submit", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useCreateDirectConversationMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: true
    });

    renderWithProviders(<ContactSellerButton postId="post-1" />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(mutateMock).not.toHaveBeenCalled();
  });
});

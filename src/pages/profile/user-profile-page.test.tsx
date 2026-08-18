import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePublicProfileQuery, useCreateProfileConversationMutation, mutateMock, navigateMock } =
  vi.hoisted(() => ({
    usePublicProfileQuery: vi.fn(),
    useCreateProfileConversationMutation: vi.fn(),
    mutateMock: vi.fn(),
    navigateMock: vi.fn()
  }));

vi.mock("../../features/profile/use-public-profile-query", () => ({
  usePublicProfileQuery
}));
vi.mock("../../features/conversations/use-create-profile-conversation-mutation", () => ({
  useCreateProfileConversationMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { UserProfilePage } from "./user-profile-page";

const initialAuthState = useAuthStore.getState();

const samplePublicProfile = {
  id: "user-2",
  displayName: "Bob",
  bio: "Hi there, I like hiking.",
  avatarUrl: null,
  locationName: "Rockville"
};

function renderPage() {
  return renderWithProviders(<UserProfilePage />, {
    initialEntries: ["/users/user-2"],
    route: "/users/:userId"
  });
}

describe("UserProfilePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    usePublicProfileQuery.mockReset();
    useCreateProfileConversationMutation.mockReset();
    mutateMock.mockReset();
    navigateMock.mockReset();

    useCreateProfileConversationMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: false
    });
  });

  it("shows a loading message while the query is pending", () => {
    usePublicProfileQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows a plain error message on a genuine fetch failure", () => {
    usePublicProfileQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("用户信息加载失败，请稍后重试。");
  });

  it("shows a not-found message when the query resolves to null", () => {
    usePublicProfileQuery.mockReturnValue({ data: null, isPending: false, isError: false });

    renderPage();

    expect(screen.getByRole("heading", { name: "用户未找到" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("用户不存在。");
  });

  it("renders avatar-initial placeholder, nickname, location, and bio for a normal profile", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bob" })).toBeInTheDocument();
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(screen.getByText("Hi there, I like hiking.")).toBeInTheDocument();
  });

  it("renders an <img> avatar when avatarUrl is present", () => {
    usePublicProfileQuery.mockReturnValue({
      data: { ...samplePublicProfile, avatarUrl: "https://example.com/bob.jpg" },
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/bob.jpg"
    );
  });

  it("does not render a bio section (no '暂无简介' placeholder) when bio is empty", () => {
    usePublicProfileQuery.mockReturnValue({
      data: { ...samplePublicProfile, bio: null },
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.queryByText(/暂无简介/)).not.toBeInTheDocument();
    expect(screen.queryByText("Hi there, I like hiking.")).not.toBeInTheDocument();
  });

  it("shows a '发消息' button for a visitor viewing someone else's profile", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByRole("button", { name: "发消息" })).toBeInTheDocument();
  });

  it("does not show a '发消息' button when viewing your own profile", () => {
    useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.queryByRole("button", { name: "发消息" })).not.toBeInTheDocument();
  });

  it("navigates to /login when clicking 发消息 while logged out", () => {
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发消息" }));

    expect(navigateMock).toHaveBeenCalledWith("/login");
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("calls createProfileConversation with the target userId and navigates to the conversation on success", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });
    mutateMock.mockImplementation((_targetUserId, { onSuccess }) => {
      onSuccess({ conversationId: "conv-1" });
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发消息" }));

    expect(mutateMock).toHaveBeenCalledWith("user-2", expect.any(Object));
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/messages/conv-1");
    });
  });

  it("shows the daily-limit message verbatim when the mutation rejects with PROFILE_CONVERSATION_DAILY_LIMIT_REACHED", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });
    mutateMock.mockImplementation((_targetUserId, { onError }) => {
      onError(
        new AppError(
          "你今天主动私信的新用户数量已经达到上限，请明天再试。",
          "PROFILE_CONVERSATION_DAILY_LIMIT_REACHED"
        )
      );
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发消息" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "你今天主动私信的新用户数量已经达到上限，请明天再试。"
    );
  });

  it("shows the account-restricted message verbatim when the mutation rejects with ACCOUNT_RESTRICTED", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });
    mutateMock.mockImplementation((_targetUserId, { onError }) => {
      onError(
        new AppError(
          "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。",
          "ACCOUNT_RESTRICTED"
        )
      );
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发消息" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    );
  });

  it("shows a generic error message for an unrecognized failure", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePublicProfileQuery.mockReturnValue({
      data: samplePublicProfile,
      isPending: false,
      isError: false
    });
    mutateMock.mockImplementation((_targetUserId, { onError }) => {
      onError(new Error("network down"));
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "发消息" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "会话创建失败，请稍后重试。"
    );
  });
});

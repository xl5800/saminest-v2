import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useDmvCommunityQuery,
  useJoinCommunityMutation,
  useCreateCommunityPostMutation,
  joinMutate,
  joinMutateAsync,
  createMutateAsync,
  navigateMock
} = vi.hoisted(() => ({
  useDmvCommunityQuery: vi.fn(),
  useJoinCommunityMutation: vi.fn(),
  useCreateCommunityPostMutation: vi.fn(),
  joinMutate: vi.fn(),
  joinMutateAsync: vi.fn(),
  createMutateAsync: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../features/community/use-dmv-community-query", () => ({ useDmvCommunityQuery }));
vi.mock("../../features/community/use-join-community-mutation", () => ({
  useJoinCommunityMutation
}));
vi.mock("../../features/community/use-create-community-post-mutation", () => ({
  useCreateCommunityPostMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { CreateCommunityPostPage } from "./create-community-post-page";

const initialAuthState = useAuthStore.getState();

function fillBody(value: string) {
  fireEvent.change(screen.getByPlaceholderText("说点什么吧…"), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "发布" }));
}

describe("CreateCommunityPostPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    navigateMock.mockReset();
    joinMutate.mockReset();
    joinMutateAsync.mockReset();
    createMutateAsync.mockReset();
    useDmvCommunityQuery.mockReset();
    useJoinCommunityMutation.mockReset();
    useCreateCommunityPostMutation.mockReset();

    useDmvCommunityQuery.mockReturnValue({ data: { id: "c-1", name: "DMV 社区", slug: "dmv" } });
    useJoinCommunityMutation.mockReturnValue({
      mutate: joinMutate,
      mutateAsync: joinMutateAsync
    });
    useCreateCommunityPostMutation.mockReturnValue({ mutateAsync: createMutateAsync });
    joinMutateAsync.mockResolvedValue(undefined);
    createMutateAsync.mockResolvedValue({ id: "cp-9" });
  });

  it("silently joins the community on mount", () => {
    renderWithProviders(<CreateCommunityPostPage />);

    expect(joinMutate).toHaveBeenCalledWith({ communityId: "c-1", userId: "user-1" });
  });

  it("offers the six post types with 讨论 selected by default", () => {
    renderWithProviders(<CreateCommunityPostPage />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("discussion");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "讨论",
      "提问",
      "求助",
      "推荐",
      "本地资讯",
      "分享"
    ]);
  });

  it("rejects an empty body without calling the mutations", async () => {
    renderWithProviders(<CreateCommunityPostPage />);

    fillBody("   ");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("请写点内容再发布。");
    expect(joinMutateAsync).not.toHaveBeenCalled();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("confirms membership, creates the post with a null title when the title is blank, then navigates to the detail page", async () => {
    renderWithProviders(<CreateCommunityPostPage />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "question" } });
    fillBody("  有人知道吗  ");
    submit();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-9");
    });
    expect(joinMutateAsync).toHaveBeenCalledWith({ communityId: "c-1", userId: "user-1" });
    expect(createMutateAsync).toHaveBeenCalledWith({
      communityId: "c-1",
      authorId: "user-1",
      postType: "question",
      title: null,
      body: "有人知道吗"
    });
    expect(joinMutateAsync.mock.invocationCallOrder[0]).toBeLessThan(
      createMutateAsync.mock.invocationCallOrder[0]!
    );
  });

  it("sends the trimmed title when one is given", async () => {
    renderWithProviders(<CreateCommunityPostPage />);

    fireEvent.change(screen.getByPlaceholderText("起个标题"), { target: { value: " 标题 " } });
    fillBody("正文");
    submit();

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ title: "标题", body: "正文", postType: "discussion" })
    );
  });

  it("shows the ACCOUNT_RESTRICTED message and does not navigate when the account is restricted", async () => {
    createMutateAsync.mockRejectedValue(
      new AppError("您的账号当前处于限制状态", "ACCOUNT_RESTRICTED")
    );
    renderWithProviders(<CreateCommunityPostPage />);

    fillBody("正文");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("您的账号当前处于限制状态");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows a generic retry message for any other failure and re-enables submitting", async () => {
    createMutateAsync.mockRejectedValueOnce(new Error("network down"));
    renderWithProviders(<CreateCommunityPostPage />);

    fillBody("正文");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("发布失败，请稍后重试。");
    expect(navigateMock).not.toHaveBeenCalled();

    // 失败后按钮恢复可点，再次提交会成功。
    submit();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-9"));
  });

  it("does not create a post when confirming membership fails", async () => {
    joinMutateAsync.mockRejectedValue(new Error("join failed"));
    renderWithProviders(<CreateCommunityPostPage />);

    fillBody("正文");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("发布失败，请稍后重试。");
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("tells the user to wait when the community has not loaded yet", async () => {
    useDmvCommunityQuery.mockReturnValue({ data: undefined });
    renderWithProviders(<CreateCommunityPostPage />);

    fillBody("正文");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("社区信息还没加载完成");
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});

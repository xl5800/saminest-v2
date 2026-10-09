import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useCommunityBySlugQuery,
  useMyCommunitiesQuery,
  useJoinCommunityMutation,
  useCreateCommunityPostMutation,
  joinMutate,
  joinMutateAsync,
  createMutateAsync,
  navigateMock
} = vi.hoisted(() => ({
  useCommunityBySlugQuery: vi.fn(),
  useMyCommunitiesQuery: vi.fn(),
  useJoinCommunityMutation: vi.fn(),
  useCreateCommunityPostMutation: vi.fn(),
  joinMutate: vi.fn(),
  joinMutateAsync: vi.fn(),
  createMutateAsync: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../features/community/use-community-by-slug-query", () => ({
  useCommunityBySlugQuery
}));
vi.mock("../../features/community/use-my-communities-query", () => ({ useMyCommunitiesQuery }));
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

const { uploadCommunityPostImage, removeCommunityPostImageFiles, insertCommunityPostImages } =
  vi.hoisted(() => ({
    uploadCommunityPostImage: vi.fn(),
    removeCommunityPostImageFiles: vi.fn(),
    insertCommunityPostImages: vi.fn()
  }));

vi.mock("../../services/storage/community-post-image-storage-service", () => ({
  communityPostImageStorageService: { uploadCommunityPostImage, removeCommunityPostImageFiles }
}));
vi.mock("../../repositories/community-post-images-repository", () => ({
  insertCommunityPostImages
}));
// 选图/预览/校验是 PostImagePicker 自己的职责（有自己的测试）；这里只关心发帖页
// 怎么接入它——换成一个能直接塞入 File 的假实现，不依赖 URL.createObjectURL。
vi.mock("../../components/post-image-picker", () => ({
  PostImagePicker: ({
    value,
    onChange,
    id
  }: {
    value: File[];
    onChange: (files: File[]) => void;
    id?: string;
  }) => (
    <div data-testid="image-picker" data-id={id} data-count={value.length}>
      <button
        type="button"
        onClick={() =>
          onChange([
            new File(["a"], "a.jpg", { type: "image/jpeg" }),
            new File(["b"], "b.png", { type: "image/png" }),
            new File(["c"], "c.webp", { type: "image/webp" })
          ])
        }
      >
        选三张图
      </button>
    </div>
  )
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { CreateCommunityPostPage } from "./create-community-post-page";

const initialAuthState = useAuthStore.getState();

/** 从某个社区 Feed 页进来发帖：/community/:slug/new，社区由 slug 解析、不显示选择器。 */
function renderCreate(entry = "/community/dmv/new") {
  return renderWithProviders(<CreateCommunityPostPage />, {
    initialEntries: [entry],
    route: "/community/:slug/new"
  });
}

/** 从首页发布弹层进来发帖：全局入口 /community/new，没有 slug，表单里选社区。 */
function renderPicker() {
  return renderWithProviders(<CreateCommunityPostPage />, {
    initialEntries: ["/community/new"],
    route: "/community/new"
  });
}

function joined(id: string, slug: string, name: string) {
  return {
    id,
    slug,
    name,
    description: null,
    memberCount: 1,
    isOfficial: false,
    stateCodes: ["DC", "MD", "VA"]
  };
}

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
    useCommunityBySlugQuery.mockReset();
    useMyCommunitiesQuery.mockReset();
    useJoinCommunityMutation.mockReset();
    useCreateCommunityPostMutation.mockReset();

    useCommunityBySlugQuery.mockReturnValue({ data: { id: "c-1", name: "DMV 社区", slug: "dmv" } });
    useMyCommunitiesQuery.mockReturnValue({ data: undefined, isPending: false, isError: false });
    useJoinCommunityMutation.mockReturnValue({
      mutate: joinMutate,
      mutateAsync: joinMutateAsync
    });
    useCreateCommunityPostMutation.mockReturnValue({ mutateAsync: createMutateAsync });
    joinMutateAsync.mockResolvedValue(undefined);
    createMutateAsync.mockResolvedValue({ id: "cp-9" });

    uploadCommunityPostImage.mockReset();
    removeCommunityPostImageFiles.mockReset();
    insertCommunityPostImages.mockReset();
    let uploadCounter = 0;
    uploadCommunityPostImage.mockImplementation(async ({ file }: { file: File }) => {
      uploadCounter += 1;
      return {
        storagePath: `user-1/cp-9/img-${uploadCounter}.webp`,
        publicUrl: `https://x/img-${uploadCounter}.webp`,
        sizeBytes: file.size,
        mimeType: file.type
      };
    });
    insertCommunityPostImages.mockResolvedValue([]);
    removeCommunityPostImageFiles.mockResolvedValue(undefined);
  });

  it("resolves the community from the route's :slug and confirms membership on mount (explicit publish intent, not a silent auto-join)", () => {
    renderCreate("/community/dmv-pets/new");

    expect(useCommunityBySlugQuery).toHaveBeenCalledWith("dmv-pets");
    expect(joinMutate).toHaveBeenCalledWith({ communityId: "c-1", userId: "user-1" });
  });

  it("does not render a 选择社区 picker (and never asks for the joined list) when coming from a community's own feed", () => {
    renderCreate();

    expect(screen.queryByLabelText("选择社区")).not.toBeInTheDocument();
    expect(useMyCommunitiesQuery).toHaveBeenCalledWith(undefined);
  });

  it("rejects an empty body without calling the mutations", async () => {
    renderCreate();

    fillBody("   ");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("请写点内容再发布。");
    expect(joinMutateAsync).not.toHaveBeenCalled();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("confirms membership, creates the post with a null title when the title is blank, then navigates to the detail page", async () => {
    renderCreate();

    fillBody("  有人知道吗  ");
    submit();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-9");
    });
    expect(joinMutateAsync).toHaveBeenCalledWith({ communityId: "c-1", userId: "user-1" });
    expect(createMutateAsync).toHaveBeenCalledWith({
      communityId: "c-1",
      authorId: "user-1",
      postType: "discussion",
      title: null,
      body: "有人知道吗"
    });
    expect(joinMutateAsync.mock.invocationCallOrder[0]).toBeLessThan(
      createMutateAsync.mock.invocationCallOrder[0]!
    );
  });

  it("sends the trimmed title when one is given", async () => {
    renderCreate();

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
    renderCreate();

    fillBody("正文");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("您的账号当前处于限制状态");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows a generic retry message for any other failure and re-enables submitting", async () => {
    createMutateAsync.mockRejectedValueOnce(new Error("network down"));
    renderCreate();

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
    renderCreate();

    fillBody("正文");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("发布失败，请稍后重试。");
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  describe("images", () => {
    function pickThreeAndSubmit() {
      fireEvent.click(screen.getByRole("button", { name: "选三张图" }));
      fillBody("带图的帖子");
      submit();
    }

    it("mounts the shared PostImagePicker with its own id and no extra props", () => {
      renderCreate();

      expect(screen.getByTestId("image-picker")).toHaveAttribute("data-id", "community-post-image-picker");
      expect(screen.getByTestId("image-picker")).toHaveAttribute("data-count", "0");
    });

    it("does not touch Storage or the images table when no image is selected", async () => {
      renderCreate();

      fillBody("纯文字");
      submit();

      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-9"));
      expect(uploadCommunityPostImage).not.toHaveBeenCalled();
      expect(insertCommunityPostImages).not.toHaveBeenCalled();
    });

    it("uploads every selected image after the post exists, inserts them with sort_order 0..n-1 in selection order, and navigates without a notice", async () => {
      renderCreate();

      pickThreeAndSubmit();

      await waitFor(() => expect(navigateMock).toHaveBeenCalled());
      expect(createMutateAsync.mock.invocationCallOrder[0]).toBeLessThan(
        uploadCommunityPostImage.mock.invocationCallOrder[0]!
      );
      expect(uploadCommunityPostImage).toHaveBeenCalledTimes(3);
      expect(uploadCommunityPostImage.mock.calls.map(([arg]) => [arg.file.name, arg.userId, arg.communityPostId])).toEqual([
        ["a.jpg", "user-1", "cp-9"],
        ["b.png", "user-1", "cp-9"],
        ["c.webp", "user-1", "cp-9"]
      ]);
      expect(insertCommunityPostImages).toHaveBeenCalledTimes(1);
      const rows = insertCommunityPostImages.mock.calls[0]![0] as Array<Record<string, unknown>>;
      expect(rows.map((r) => [r.sortOrder, r.communityPostId, r.ownerId])).toEqual([
        [0, "cp-9", "user-1"],
        [1, "cp-9", "user-1"],
        [2, "cp-9", "user-1"]
      ]);
      expect(navigateMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-9");
      expect(removeCommunityPostImageFiles).not.toHaveBeenCalled();
    });

    it("on a partial upload failure still inserts the successful ones (original sort positions kept) and navigates with the failure notice", async () => {
      uploadCommunityPostImage.mockReset();
      uploadCommunityPostImage
        .mockResolvedValueOnce({ storagePath: "p/0.webp", publicUrl: "u0", sizeBytes: 1, mimeType: "image/webp" })
        .mockRejectedValueOnce(new Error("upload failed"))
        .mockResolvedValueOnce({ storagePath: "p/2.webp", publicUrl: "u2", sizeBytes: 1, mimeType: "image/webp" });
      renderCreate();

      pickThreeAndSubmit();

      await waitFor(() => expect(navigateMock).toHaveBeenCalled());
      const rows = insertCommunityPostImages.mock.calls[0]![0] as Array<Record<string, unknown>>;
      expect(rows.map((r) => [r.storagePath, r.sortOrder])).toEqual([
        ["p/0.webp", 0],
        ["p/2.webp", 2]
      ]);
      expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-9", {
        state: { publishSuccessMessage: "帖子已发布，但部分图片上传失败。" }
      });
    });

    it("when every upload fails, skips the insert but still navigates to the detail page with the failure notice", async () => {
      uploadCommunityPostImage.mockReset();
      uploadCommunityPostImage.mockRejectedValue(new Error("upload failed"));
      renderCreate();

      pickThreeAndSubmit();

      await waitFor(() => expect(navigateMock).toHaveBeenCalled());
      expect(insertCommunityPostImages).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-9", {
        state: { publishSuccessMessage: "帖子已发布，但部分图片上传失败。" }
      });
    });

    it("when the batch insert fails, cleans up exactly the just-uploaded Storage files and still navigates with the failure notice", async () => {
      insertCommunityPostImages.mockRejectedValue(new Error("insert failed"));
      renderCreate();

      pickThreeAndSubmit();

      await waitFor(() => expect(navigateMock).toHaveBeenCalled());
      expect(removeCommunityPostImageFiles).toHaveBeenCalledWith([
        "user-1/cp-9/img-1.webp",
        "user-1/cp-9/img-2.webp",
        "user-1/cp-9/img-3.webp"
      ]);
      expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-9", {
        state: { publishSuccessMessage: "帖子已发布，但部分图片上传失败。" }
      });
    });

    it("a failing cleanup does not block navigation", async () => {
      insertCommunityPostImages.mockRejectedValue(new Error("insert failed"));
      removeCommunityPostImageFiles.mockRejectedValue(new Error("cleanup failed"));
      renderCreate();

      pickThreeAndSubmit();

      await waitFor(() => expect(navigateMock).toHaveBeenCalled());
      expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-9", {
        state: { publishSuccessMessage: "帖子已发布，但部分图片上传失败。" }
      });
    });

    it("does not upload anything when creating the post itself fails", async () => {
      createMutateAsync.mockRejectedValue(new Error("create failed"));
      renderCreate();

      pickThreeAndSubmit();

      expect(await screen.findByRole("alert")).toHaveTextContent("发布失败，请稍后重试。");
      expect(uploadCommunityPostImage).not.toHaveBeenCalled();
      expect(insertCommunityPostImages).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  it("tells the user to wait when the community has not loaded yet", async () => {
    useCommunityBySlugQuery.mockReturnValue({ data: undefined });
    renderCreate();

    fillBody("正文");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("社区信息还没加载完成");
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  describe("community picker (global entry /community/new, no slug)", () => {
    beforeEach(() => {
      useCommunityBySlugQuery.mockReturnValue({ data: undefined });
      useMyCommunitiesQuery.mockReturnValue({
        data: [joined("c-2", "dmv-pets", "DMV 宠物社区"), joined("c-3", "dmv-students", "DMV 留学生社区")],
        isPending: false,
        isError: false
      });
    });

    it("asks for the current user's joined communities and renders a required 选择社区 select listing exactly those, first one selected by default", () => {
      renderPicker();

      expect(useMyCommunitiesQuery).toHaveBeenCalledWith("user-1");
      const select = screen.getByLabelText("选择社区");
      expect(select).toBeRequired();
      expect(select).toHaveValue("c-2");
      expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "DMV 宠物社区",
        "DMV 留学生社区"
      ]);
    });

    it("does not join anything on mount (no silent join, the options are already joined communities)", () => {
      renderPicker();

      expect(joinMutate).not.toHaveBeenCalled();
    });

    it("posts into the community picked in the select, confirming membership of that same community first", async () => {
      renderPicker();

      fireEvent.change(screen.getByLabelText("选择社区"), { target: { value: "c-3" } });
      fillBody("正文");
      submit();

      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-9"));
      expect(joinMutateAsync).toHaveBeenCalledWith({ communityId: "c-3", userId: "user-1" });
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ communityId: "c-3", postType: "discussion" })
      );
    });

    it("posts into the default (first) community when the user never touches the select", async () => {
      renderPicker();

      fillBody("正文");
      submit();

      await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
      expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ communityId: "c-2" }));
    });

    it("shows the join-a-community prompt (no form) with a link to /community when the user has joined nothing", () => {
      useMyCommunitiesQuery.mockReturnValue({ data: [], isPending: false, isError: false });

      renderPicker();

      expect(screen.getByText("你还没有加入任何社区，发帖前请先加入一个社区。")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "去加入社区" })).toHaveAttribute("href", "/community");
      expect(screen.queryByPlaceholderText("说点什么吧…")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("选择社区")).not.toBeInTheDocument();
    });

    it("shows a skeleton (not the prompt, not the form) while the joined list is loading", () => {
      useMyCommunitiesQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

      renderPicker();

      expect(screen.getByRole("status")).toHaveTextContent("加载中…");
      expect(screen.queryByText(/你还没有加入任何社区/)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("说点什么吧…")).not.toBeInTheDocument();
    });

    it("shows an error alert (not the prompt, not the form) when the joined list fails to load", () => {
      useMyCommunitiesQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

      renderPicker();

      expect(screen.getByRole("alert")).toHaveTextContent("已加入的社区加载失败，请稍后重试。");
      expect(screen.queryByText(/你还没有加入任何社区/)).not.toBeInTheDocument();
    });

    it("keeps the hidden post type at 讨论 (no 类型 field comes back with the picker)", () => {
      renderPicker();

      expect(screen.queryByLabelText(/类型/)).not.toBeInTheDocument();
    });
  });
});

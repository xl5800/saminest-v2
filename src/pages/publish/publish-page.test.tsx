import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveCategories, listActiveLocations, createPost, navigateMock } =
  vi.hoisted(() => ({
    listActiveCategories: vi.fn(),
    listActiveLocations: vi.fn(),
    createPost: vi.fn(),
    navigateMock: vi.fn()
  }));

vi.mock("../../repositories/categories-repository", () => ({
  listActiveCategories
}));
vi.mock("../../repositories/locations-repository", () => ({
  listActiveLocations
}));
vi.mock("../../repositories/posts-repository", () => ({
  createPost
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { PublishPage } from "./publish-page";

const initialAuthState = useAuthStore.getState();

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("分类"), {
    target: { value: "cat-1" }
  });
  fireEvent.change(screen.getByLabelText("标题"), {
    target: { value: "Sunny room near metro" }
  });
  fireEvent.change(screen.getByLabelText("描述"), {
    target: { value: "A description that is definitely long enough." }
  });
}

describe("PublishPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    listActiveCategories.mockReset();
    listActiveLocations.mockReset();
    createPost.mockReset();
    navigateMock.mockReset();

    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listActiveLocations.mockResolvedValue([
      { id: "loc-1", name: "Rockville" }
    ]);
    useAuthStore.getState().setSession({
      user: { id: "user-1" }
    } as never);
  });

  it("renders category and location options loaded from the database, not hardcoded", async () => {
    renderWithProviders(<PublishPage />);

    expect(
      await screen.findByRole("option", { name: "租房" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "Rockville" })
    ).toBeInTheDocument();
    expect(listActiveCategories).toHaveBeenCalled();
    expect(listActiveLocations).toHaveBeenCalled();
  });

  it("does not render any field for author_id or status", () => {
    renderWithProviders(<PublishPage />);

    expect(screen.queryByLabelText(/作者/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/状态/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/author/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
  });

  it("blocks submission when the title is shorter than 5 characters", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fireEvent.change(screen.getByLabelText("分类"), {
      target: { value: "cat-1" }
    });
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "abcd" }
    });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "A description that is definitely long enough." }
    });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "标题长度需要在 5-120 字符之间。"
    );
    expect(createPost).not.toHaveBeenCalled();
  });

  it("blocks submission when no category is selected", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "Sunny room near metro" }
    });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "A description that is definitely long enough." }
    });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请选择分类。");
    expect(createPost).not.toHaveBeenCalled();
  });

  it("submits author_id from the auth store and hardcodes status to pending via createPost, then redirects with a success message", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith({
        authorId: "user-1",
        categoryId: "cat-1",
        locationId: null,
        title: "Sunny room near metro",
        description: "A description that is definitely long enough.",
        priceAmount: null,
        contactMethod: null,
        contactValue: null
      });
    });

    expect(navigateMock).toHaveBeenCalledWith("/post/post-999", {
      replace: true,
      state: { publishSuccessMessage: "发布成功，等待审核" }
    });
  });

  it("shows a generic error message and does not navigate when createPost fails", async () => {
    createPost.mockRejectedValue(new Error("insert failed"));
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "发布失败，请稍后重试。"
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

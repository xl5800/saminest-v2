import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useSubmitFeedbackMutation,
  mutateAsyncMock,
  uploadFeedbackImage,
  removeFeedbackImageFiles,
  insertFeedbackImages
} = vi.hoisted(() => ({
  useSubmitFeedbackMutation: vi.fn(),
  mutateAsyncMock: vi.fn(),
  uploadFeedbackImage: vi.fn(),
  removeFeedbackImageFiles: vi.fn(),
  insertFeedbackImages: vi.fn()
}));

vi.mock("../../features/feedback/use-submit-feedback-mutation", () => ({
  useSubmitFeedbackMutation
}));
vi.mock("../../services/storage/feedback-image-storage-service", () => ({
  feedbackImageStorageService: { uploadFeedbackImage, removeFeedbackImageFiles }
}));
vi.mock("../../repositories/feedback-images-repository", () => ({
  insertFeedbackImages
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { SubmitFeedbackPage } from "./submit-feedback-page";

const initialAuthState = useAuthStore.getState();

function renderPage() {
  return renderWithProviders(<SubmitFeedbackPage />);
}

function fillRequiredFields() {
  fireEvent.click(screen.getByLabelText("问题反馈"));
  fireEvent.change(screen.getByLabelText("标题"), {
    target: { value: "首页图片加载失败" }
  });
  fireEvent.change(screen.getByLabelText("内容"), {
    target: { value: "在首页点击帖子卡片时，封面图一直显示占位图。" }
  });
}

function makeImageFile(name: string): File {
  return new File(["fake image bytes"], name, { type: "image/png" });
}

function selectImages(files: File[]) {
  const input = screen.getByLabelText(/添加截图/) as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

describe("SubmitFeedbackPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    mutateAsyncMock.mockReset();
    useSubmitFeedbackMutation.mockReset();
    useSubmitFeedbackMutation.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false
    });
    uploadFeedbackImage.mockReset();
    removeFeedbackImageFiles.mockReset();
    insertFeedbackImages.mockReset();
    insertFeedbackImages.mockResolvedValue([]);
  });

  it("renders the type options", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "意见反馈" })).toBeInTheDocument();
    expect(screen.getByLabelText("问题反馈")).toBeInTheDocument();
    expect(screen.getByLabelText("功能建议")).toBeInTheDocument();
    expect(screen.getByLabelText("投诉")).toBeInTheDocument();
    expect(screen.getByLabelText("其他")).toBeInTheDocument();
  });

  it("shows a validation error and does not call the mutation when no type is selected", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "首页图片加载失败" }
    });
    fireEvent.change(screen.getByLabelText("内容"), {
      target: { value: "在首页点击帖子卡片时，封面图一直显示占位图。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请选择反馈类型。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows a validation error when the title is empty or too long, and does not call the mutation", () => {
    renderPage();

    fireEvent.click(screen.getByLabelText("问题反馈"));
    fireEvent.change(screen.getByLabelText("内容"), {
      target: { value: "在首页点击帖子卡片时，封面图一直显示占位图。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(screen.getByRole("alert")).toHaveTextContent("标题长度需要在 5-50 字符之间。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows a validation error when the content is empty or too short, and does not call the mutation", () => {
    renderPage();

    fireEvent.click(screen.getByLabelText("问题反馈"));
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "首页图片加载失败" }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(screen.getByRole("alert")).toHaveTextContent("内容长度需要在 10-500 字符之间。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("submits successfully without any screenshots and shows the success message", async () => {
    mutateAsyncMock.mockResolvedValue({ id: "feedback-1" });
    renderPage();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(await screen.findByRole("status")).toHaveTextContent("已收到，我们会尽快处理");
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      userId: "user-1",
      type: "bug",
      title: "首页图片加载失败",
      content: "在首页点击帖子卡片时，封面图一直显示占位图。"
    });
    expect(uploadFeedbackImage).not.toHaveBeenCalled();
  });

  it("uploads selected screenshots and batch-inserts them after the feedback row is created", async () => {
    mutateAsyncMock.mockResolvedValue({ id: "feedback-1" });
    uploadFeedbackImage.mockResolvedValue({
      storagePath: "user-1/feedback-1/img-0.webp",
      publicUrl: null,
      mimeType: "image/webp",
      sizeBytes: 100
    });

    renderPage();
    fillRequiredFields();
    const file = makeImageFile("shot.png");
    selectImages([file]);
    await screen.findByText("shot.png");

    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    await waitFor(() => {
      expect(uploadFeedbackImage).toHaveBeenCalledWith({
        file,
        userId: "user-1",
        feedbackId: "feedback-1"
      });
    });
    await waitFor(() => {
      expect(insertFeedbackImages).toHaveBeenCalledWith([
        {
          feedbackId: "feedback-1",
          ownerId: "user-1",
          storagePath: "user-1/feedback-1/img-0.webp",
          publicUrl: null,
          width: null,
          height: null,
          sizeBytes: 100,
          mimeType: "image/webp",
          sortOrder: 0
        }
      ]);
    });
    expect(await screen.findByRole("status")).toHaveTextContent("已收到，我们会尽快处理");
  });

  it("shows the account-restricted message when the mutation rejects with ACCOUNT_RESTRICTED, instead of the generic error", async () => {
    mutateAsyncMock.mockRejectedValue(
      new AppError(
        "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。",
        "ACCOUNT_RESTRICTED"
      )
    );
    renderPage();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    );
    expect(uploadFeedbackImage).not.toHaveBeenCalled();
  });

  it("shows a generic error message when the mutation rejects with an unrecognized error", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("network down"));
    renderPage();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("提交失败，请稍后重试。");
  });

  it("still shows success (with the image-failure message) when a screenshot upload fails, without showing the generic submit error", async () => {
    mutateAsyncMock.mockResolvedValue({ id: "feedback-1" });
    uploadFeedbackImage.mockRejectedValue(new Error("upload failed"));

    renderPage();
    fillRequiredFields();
    selectImages([makeImageFile("shot.png")]);
    await screen.findByText("shot.png");

    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "反馈已提交，但部分截图上传失败，不影响反馈本身的处理。"
    );
    expect(insertFeedbackImages).not.toHaveBeenCalled();
  });

  it("cleans up the just-uploaded Storage files when the batch insert fails (avoids leaving orphaned files)", async () => {
    mutateAsyncMock.mockResolvedValue({ id: "feedback-1" });
    uploadFeedbackImage.mockResolvedValue({
      storagePath: "user-1/feedback-1/img-0.webp",
      publicUrl: null,
      mimeType: "image/webp",
      sizeBytes: 100
    });
    insertFeedbackImages.mockRejectedValue({
      message: "duplicate key value violates unique constraint",
      code: "23505"
    });

    renderPage();
    fillRequiredFields();
    selectImages([makeImageFile("shot.png")]);
    await screen.findByText("shot.png");

    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    await waitFor(() => {
      expect(removeFeedbackImageFiles).toHaveBeenCalledWith([
        "user-1/feedback-1/img-0.webp"
      ]);
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "反馈已提交，但部分截图上传失败，不影响反馈本身的处理。"
    );
  });

  it("does not throw and still shows the image-failure message when the cleanup itself also fails after an insert failure", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mutateAsyncMock.mockResolvedValue({ id: "feedback-1" });
    uploadFeedbackImage.mockResolvedValue({
      storagePath: "user-1/feedback-1/img-0.webp",
      publicUrl: null,
      mimeType: "image/webp",
      sizeBytes: 100
    });
    insertFeedbackImages.mockRejectedValue({ message: "insert failed", code: "23505" });
    removeFeedbackImageFiles.mockRejectedValue({ message: "remove failed", code: "500" });

    renderPage();
    fillRequiredFields();
    selectImages([makeImageFile("shot.png")]);
    await screen.findByText("shot.png");

    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "反馈已提交，但部分截图上传失败，不影响反馈本身的处理。"
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("feedback_images 批量写入失败"),
      expect.objectContaining({ code: "23505" })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("孤儿 Storage 文件清理失败"),
      expect.objectContaining({ code: "500" })
    );

    consoleErrorSpy.mockRestore();
  });
});

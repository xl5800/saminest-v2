import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAdminSupportConversationsQuery,
  useMessagesQuery,
  useAdminReplyToSupportConversationMutation,
  mutateAsyncMock,
  navigateMock,
  uploadMessageImageMock,
  removeMessageImageFileMock
} = vi.hoisted(() => ({
  useAdminSupportConversationsQuery: vi.fn(),
  useMessagesQuery: vi.fn(),
  useAdminReplyToSupportConversationMutation: vi.fn(),
  mutateAsyncMock: vi.fn(),
  navigateMock: vi.fn(),
  uploadMessageImageMock: vi.fn(),
  removeMessageImageFileMock: vi.fn()
}));

vi.mock("../../features/admin/use-admin-support-conversations-query", () => ({
  useAdminSupportConversationsQuery
}));
vi.mock("../../features/messages/use-messages-query", () => ({
  useMessagesQuery
}));
vi.mock("../../features/admin/use-admin-reply-to-support-conversation-mutation", () => ({
  useAdminReplyToSupportConversationMutation
}));
// 联系客服改成真聊天任务卡：图片上传服务单独 mock 掉，避免测试真的
// 压缩/打到 Supabase Storage——跟 conversation-page.test.tsx 里同一个
// mock 是同一个理由，这个页面自己重复了一份上传流程（不共享组件，见
// support-conversation-page.tsx 顶部注释），所以这里也需要单独 mock 一份。
vi.mock("../../services/storage/message-image-storage-service", () => ({
  messageImageStorageService: {
    uploadMessageImage: uploadMessageImageMock,
    removeMessageImageFile: removeMessageImageFileMock
  }
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { renderWithProviders } from "../../test/render-with-providers";
import { AdminSupportConversationPage } from "./support-conversation-page";

function renderPage() {
  return renderWithProviders(<AdminSupportConversationPage />, {
    initialEntries: ["/admin/support/conversation-1"],
    route: "/admin/support/:conversationId"
  });
}

function createImageFile(name = "screenshot.png", type = "image/png", sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

function getImageInput(): HTMLInputElement {
  return screen.getByLabelText("添加图片") as HTMLInputElement;
}

describe("AdminSupportConversationPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    navigateMock.mockReset();
    mutateAsyncMock.mockReset();
    uploadMessageImageMock.mockReset();
    removeMessageImageFileMock.mockReset();
    useAdminSupportConversationsQuery.mockReset();
    useMessagesQuery.mockReset();
    useAdminReplyToSupportConversationMutation.mockReset();

    useAdminSupportConversationsQuery.mockReturnValue({
      data: [
        {
          conversationId: "conversation-1",
          userId: "user-1",
          displayName: "Alice",
          avatarUrl: null,
          lastMessageAt: "2026-07-20T12:00:00.000Z",
          lastMessagePreview: "你好"
        }
      ],
      isPending: false,
      isError: false
    });
    useMessagesQuery.mockReturnValue({ data: [], isPending: false, isError: false });
    useAdminReplyToSupportConversationMutation.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false
    });
  });

  it("shows the user's display name (from the cached admin list) as the header title, and navigates back to /admin/support on click", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Alice" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(navigateMock).toHaveBeenCalledWith("/admin/support");
  });

  // 直接用 URL 打开这个页面（比如刷新），列表缓存还没命中的情况下应该有
  // 一个兜底标题，不应该整段空白或抛错，见页面顶部注释。
  it("falls back to '客服会话' as the header title when the conversation is not found in the cached list", () => {
    useAdminSupportConversationsQuery.mockReturnValue({ data: [], isPending: false, isError: false });

    renderPage();

    expect(screen.getByRole("heading", { name: "客服会话" })).toBeInTheDocument();
  });

  it("shows a loading indicator while messages are pending", () => {
    useMessagesQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an error message when messages fail to load", () => {
    useMessagesQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("消息加载失败，请刷新页面重试。");
  });

  it("shows an empty-state message when the user has not sent anything yet", () => {
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("这个用户还没有发过消息。");
  });

  it("renders the user's message on the 'other' side and an admin reply on the 'self' side, without mixing them into a system notification card", () => {
    useMessagesQuery.mockReturnValue({
      data: [
        {
          id: "message-1",
          senderId: "user-1",
          body: "我上传的截图看不到了",
          notificationPayload: null,
          imageUrl: null,
          createdAt: "2026-07-20T12:00:00.000Z"
        },
        {
          id: "message-2",
          senderId: null,
          body: "已经修复，请重新查看",
          notificationPayload: null,
          imageUrl: null,
          createdAt: "2026-07-20T12:01:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    const userMessage = screen.getByText("我上传的截图看不到了");
    const adminMessage = screen.getByText("已经修复，请重新查看");
    expect(userMessage.closest('[data-message-owner="other"]')).toBeInTheDocument();
    expect(adminMessage.closest('[data-message-owner="self"]')).toBeInTheDocument();
    expect(container.querySelector('[data-message-owner="system"]')).not.toBeInTheDocument();
    expect(screen.getByTestId("admin-message-avatar-user")).toBeInTheDocument();
    expect(screen.getByTestId("admin-message-avatar-self")).toBeInTheDocument();
  });

  it("still renders a genuine system notification (notification_payload present) as a notification card, not a chat bubble", () => {
    useMessagesQuery.mockReturnValue({
      data: [
        {
          id: "message-1",
          senderId: null,
          body: null,
          notificationPayload: { kind: "post_approved", postId: "post-1", postTitle: "木桌" },
          imageUrl: null,
          createdAt: "2026-07-20T12:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    expect(container.querySelector('[data-message-owner="system"]')).toBeInTheDocument();
    expect(container.querySelector('[data-message-owner="self"]')).not.toBeInTheDocument();
  });

  it("renders an image thumbnail in a message bubble and opens it in the lightbox on click", () => {
    useMessagesQuery.mockReturnValue({
      data: [
        {
          id: "message-1",
          senderId: "user-1",
          body: null,
          notificationPayload: null,
          imageUrl: "https://signed.example.com/image-1.webp",
          createdAt: "2026-07-20T12:00:00.000Z"
        }
      ],
      isPending: false,
      isError: false
    });

    const { container } = renderPage();

    const thumbnail = container.querySelector('img[src="https://signed.example.com/image-1.webp"]');
    expect(thumbnail).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "查看大图" })).not.toBeInTheDocument();

    fireEvent.click(thumbnail as Element);

    expect(screen.getByRole("dialog", { name: "查看大图" })).toBeInTheDocument();
  });

  // handleSubmit 里其实还有一层 EMPTY_MESSAGE_ERROR 校验，但发送按钮在
  // 没有文字也没有图片时本来就是禁用状态（sendDisabled 里的
  // !hasComposerContent），点一个 disabled 的 <button type="submit"> 在
  // jsdom 里不会真的触发表单提交——跟 conversation-page.test.tsx 里同一套
  // 逻辑一样，这条校验分支目前没有可达的 UI 路径可以测，这里只断言按钮
  // 确实是禁用的、mutation 没被调用。
  it("disables the send button and does not call the mutation when the composer is empty", () => {
    renderPage();

    const sendButton = screen.getByRole("button", { name: "发送" });
    expect(sendButton).toBeDisabled();
    fireEvent.click(sendButton);

    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("calls admin_reply_to_support_conversation (not the regular send-message mutation) with the typed reply", async () => {
    mutateAsyncMock.mockResolvedValue(undefined);

    renderPage();
    fireEvent.change(screen.getByLabelText("回复内容"), {
      target: { value: "已经帮你处理好了" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        conversationId: "conversation-1",
        body: "已经帮你处理好了",
        imagePath: null
      });
    });
  });

  it("uploads a selected image, then sends the reply with the resulting imagePath", async () => {
    uploadMessageImageMock.mockResolvedValue({ imagePath: "conversation-1/image-1.webp" });
    mutateAsyncMock.mockResolvedValue(undefined);

    renderPage();
    fireEvent.change(getImageInput(), { target: { files: [createImageFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(uploadMessageImageMock).toHaveBeenCalledWith({
        file: expect.any(File),
        conversationId: "conversation-1"
      });
    });
    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        conversationId: "conversation-1",
        body: null,
        imagePath: "conversation-1/image-1.webp"
      });
    });
  });

  it("cleans up the uploaded image when sending the reply fails afterwards", async () => {
    uploadMessageImageMock.mockResolvedValue({ imagePath: "conversation-1/image-1.webp" });
    mutateAsyncMock.mockRejectedValue(new Error("network down"));
    removeMessageImageFileMock.mockResolvedValue(undefined);

    renderPage();
    fireEvent.change(getImageInput(), { target: { files: [createImageFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(removeMessageImageFileMock).toHaveBeenCalledWith("conversation-1/image-1.webp");
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("发送失败，请稍后重试。");
  });
});

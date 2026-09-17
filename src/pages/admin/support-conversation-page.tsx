import { Headset, ImagePlus } from "lucide-react";
import { Fragment, type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ImageLightbox } from "../../components/image-lightbox";
import { useAdminReplyToSupportConversationMutation } from "../../features/admin/use-admin-reply-to-support-conversation-mutation";
import { useAdminSupportConversationsQuery } from "../../features/admin/use-admin-support-conversations-query";
import { useMessagesQuery } from "../../features/messages/use-messages-query";
import type { NotificationPayload } from "../../repositories/messages-repository";
import { messageImageStorageService } from "../../services/storage/message-image-storage-service";
import { formatMessageTimeDivider, shouldShowMessageTimeDivider } from "../../utils/format";
import { Avatar, SystemNotificationCard } from "../messages/conversation-page";

const MESSAGE_MAX_LENGTH = 5000;
const EMPTY_MESSAGE_ERROR = "请输入文字或选一张图片再发送。";
const MESSAGE_TOO_LONG_ERROR = `消息内容不能超过 ${MESSAGE_MAX_LENGTH} 字。`;
const DEFAULT_ERROR_MESSAGE = "发送失败，请稍后重试。";
const LOAD_ERROR_MESSAGE = "消息加载失败，请刷新页面重试。";
const EMPTY_CONVERSATION_MESSAGE = "这个用户还没有发过消息。";
const IMAGE_UPLOAD_ERROR_MESSAGE = "图片发送失败，请稍后重试。";
const ACCEPTED_MESSAGE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_MESSAGE_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_MESSAGE_IMAGE_SIZE_MB = MAX_MESSAGE_IMAGE_SIZE_BYTES / (1024 * 1024);

/**
 * 联系客服改成真聊天任务卡：管理员客服会话详情页
 * （/admin/support/:conversationId），从 /admin/support 那张列表点进一条
 * 会话之后的聊天界面。
 *
 * 不是 conversation-page.tsx（用户自己视角的会话页）的另一个参数化分支，
 * 是独立的页面——两者视角刚好相反："我方"在这里指管理员自己的回复
 * （sender_id 为 null、notification_payload 也为 null 的消息），"对方"
 * 是用户发的真实消息（sender_id 是某个真实用户 id）；conversation-page.tsx
 * 那套 header（对方头像/昵称/屏蔽菜单/公开主页链接）在这里完全不适用——
 * 管理员不是这条会话的成员，没有"屏蔽"这个概念，也不需要在这里跳去看
 * 用户的公开主页。复用的只有两个纯展示组件（Avatar、
 * SystemNotificationCard，从 conversation-page.tsx 里 export 出来），
 * 视觉上跟用户自己看到的聊天气泡/系统通知卡片保持一致，不是重新设计
 * 一套样式。
 *
 * 数据来源：
 * - 用户是谁（头像/昵称）：直接从 useAdminSupportConversationsQuery() 的
 *   列表里按 conversationId 找这一条，不单独为"这一条会话的用户信息"
 *   再发一次请求——这个页面只能从 /admin/support 列表点进来，进来的时候
 *   那份列表数据大概率已经在 React Query 缓存里，不需要重复查询。如果
 *   直接用 URL 打开这个页面（列表还没加载过），头像/昵称会短暂显示占位
 *   兜底，不影响下面消息列表本身的加载。
 * - 消息列表：复用 useMessagesQuery()，跟用户自己那边用的是同一个
 *   hook/同一份 RLS（messages_select_of_own_conversations 这次新增了
 *   "管理员 + 这条消息所属会话是 system 类型"的例外，见对应迁移文件），
 *   不需要为管理员另外写一份查询。
 * - 发送回复：useAdminReplyToSupportConversationMutation()，唯一合法
 *   入口是 admin_reply_to_support_conversation() 这个数据库函数——不能
 *   用 useSendMessageMutation()/sendMessage()，那个要求发送者是会话
 *   成员，管理员不是。
 *
 * 图片：跟 conversation-page.tsx 是同一套流程（选择→本地预览→点发送时
 * 才压缩上传到 message-images 私有桶→拿到路径随消息一起提交），这里
 * 没有抽成共享组件——两边除了"调用哪个 mutation 发送"之外，输入框/预览/
 * 校验这几块 UI 逐字重复的代价（一个不到 40 行的 <input type="file">+
 * 预览 chip）小于抽象出一个通用组件所需要的参数化复杂度，属于这个仓库
 * 一贯"体量小、调用方少的重复暂不抽象"的取舍（跟
 * feedback-image-storage-service.ts 不复用 post-image-storage-service.ts
 * 是同一个原则）。
 */
export function AdminSupportConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();

  const { data: conversations } = useAdminSupportConversationsQuery();
  const conversationInfo = conversations?.find((item) => item.conversationId === conversationId);

  const {
    data: messages,
    isPending: messagesPending,
    isError: messagesError
  } = useMessagesQuery(conversationId ?? "");
  const replyMutation = useAdminReplyToSupportConversationMutation();

  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  const messageList = messages ?? [];

  useEffect(() => {
    if (messagesPending || messageList.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [conversationId, messagesPending, messageList.length]);

  function handleImageInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setImageError(null);
    if (!ACCEPTED_MESSAGE_IMAGE_MIME_TYPES.includes(file.type)) {
      setImageError("只支持 JPEG、PNG 或 WEBP 格式的图片。");
      return;
    }
    if (file.size === 0) {
      setImageError("文件是空的，无法上传。");
      return;
    }
    if (file.size > MAX_MESSAGE_IMAGE_SIZE_BYTES) {
      setImageError(`文件大小不能超过 ${MAX_MESSAGE_IMAGE_SIZE_MB}MB。`);
      return;
    }
    setImageFile(file);
  }

  function handleRemoveImage(): void {
    setImageFile(null);
    setImageError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!conversationId || replyMutation.isPending || isUploadingImage) return;

    setValidationError(null);
    setSubmitError(null);

    const trimmedBody = body.trim();
    if (!trimmedBody && !imageFile) {
      setValidationError(EMPTY_MESSAGE_ERROR);
      return;
    }
    if (trimmedBody.length > MESSAGE_MAX_LENGTH) {
      setValidationError(MESSAGE_TOO_LONG_ERROR);
      return;
    }

    let imagePath: string | null = null;
    if (imageFile) {
      setIsUploadingImage(true);
      try {
        const result = await messageImageStorageService.uploadMessageImage({
          file: imageFile,
          conversationId
        });
        imagePath = result.imagePath;
      } catch {
        setIsUploadingImage(false);
        setSubmitError(IMAGE_UPLOAD_ERROR_MESSAGE);
        return;
      }
      setIsUploadingImage(false);
    }

    try {
      await replyMutation.mutateAsync({
        conversationId,
        body: trimmedBody || null,
        imagePath
      });
      setBody("");
      handleRemoveImage();
    } catch {
      if (imagePath) {
        messageImageStorageService.removeMessageImageFile(imagePath).catch((cleanupError) => {
          console.error("清理发送失败后残留的聊天图片失败：", cleanupError);
        });
      }
      setSubmitError(DEFAULT_ERROR_MESSAGE);
    }
  }

  const hasComposerContent = body.trim().length > 0 || imageFile !== null;
  const sendDisabled = replyMutation.isPending || isUploadingImage || !hasComposerContent;
  const userInitial = conversationInfo?.displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <main className="mx-auto grid h-dvh w-full max-w-2xl grid-rows-[3.5rem_minmax(0,1fr)_auto] overflow-hidden bg-bg">
      <header className="grid h-14 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center border-b border-border bg-card px-2">
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate("/admin/support")}
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-text hover:bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          ←
        </button>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-base font-semibold text-text">
            {conversationInfo?.displayName ?? "客服会话"}
          </h1>
        </div>
        <span aria-hidden="true" />
      </header>

      <section
        ref={messagesContainerRef}
        aria-label="消息记录"
        data-testid="admin-support-messages"
        className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 pb-6"
      >
        {messagesPending ? (
          <p role="status" className="text-sm text-text-muted">加载中…</p>
        ) : null}
        {messagesError ? (
          <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {LOAD_ERROR_MESSAGE}
          </p>
        ) : null}
        {!messagesPending && !messagesError && messageList.length === 0 ? (
          <div className="flex min-h-full items-center justify-center px-6 text-center">
            <p role="status" className="text-sm text-text-muted">{EMPTY_CONVERSATION_MESSAGE}</p>
          </div>
        ) : null}
        {!messagesPending && !messagesError && messageList.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {messageList.map((message, index) => {
              const previousMessage = messageList[index - 1];
              const showTimeDivider = shouldShowMessageTimeDivider(
                message.createdAt,
                previousMessage ? previousMessage.createdAt : null
              );
              const isSystemMessage = message.notificationPayload !== null;
              // 管理员视角："我方"是管理员自己发的回复（sender_id 为
              // null 且不是系统通知），"对方"是用户发的真实消息
              // （sender_id 是某个真实用户 id）——跟 conversation-page.tsx
              // 用户视角的 isMine 判断刚好是镜像关系。
              const isMine = !isSystemMessage && message.senderId === null;
              return (
                <Fragment key={message.id}>
                  {showTimeDivider ? (
                    <li className="flex justify-center">
                      <time
                        dateTime={message.createdAt}
                        className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-text-muted"
                      >
                        {formatMessageTimeDivider(message.createdAt)}
                      </time>
                    </li>
                  ) : null}
                  {isSystemMessage ? (
                    <li data-message-owner="system" aria-label="系统通知" className="flex justify-center">
                      <SystemNotificationCard
                        payload={message.notificationPayload as NotificationPayload}
                        createdAt={message.createdAt}
                      />
                    </li>
                  ) : (
                    <li
                      data-message-owner={isMine ? "self" : "other"}
                      aria-label={isMine ? "客服发送的消息" : "用户发送的消息"}
                      className={`flex items-start gap-2.5 ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      {!isMine ? (
                        <Avatar
                          avatarUrl={conversationInfo?.avatarUrl ?? null}
                          initial={userInitial}
                          sizeClassName="h-9 w-9"
                          testId="admin-message-avatar-user"
                        />
                      ) : null}
                      <div className={`flex min-w-0 max-w-[75%] flex-col ${isMine ? "items-end" : "items-start"}`}>
                        {message.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightboxImageUrl(message.imageUrl)}
                            className="mb-1 block overflow-hidden rounded-2xl"
                          >
                            <img src={message.imageUrl} alt="" className="h-40 w-40 object-cover" />
                          </button>
                        ) : null}
                        {message.body ? (
                          <div
                            className={
                              isMine
                                ? "min-w-0 whitespace-pre-wrap rounded-2xl bg-primary px-3.5 py-2.5 text-base text-white [overflow-wrap:anywhere]"
                                : "min-w-0 whitespace-pre-wrap rounded-2xl border border-border bg-card px-3.5 py-2.5 text-base text-text [overflow-wrap:anywhere]"
                            }
                          >
                            {message.body}
                          </div>
                        ) : null}
                      </div>
                      {isMine ? (
                        <div
                          aria-hidden="true"
                          data-testid="admin-message-avatar-self"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted"
                        >
                          <Headset size={18} />
                        </div>
                      ) : null}
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ul>
        ) : null}
      </section>

      <form
        onSubmit={handleSubmit}
        noValidate
        data-testid="admin-support-composer"
        className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-2 border-t border-border bg-card px-4 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {validationError ? (
          <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {validationError}
          </p>
        ) : null}
        {submitError ? (
          <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {submitError}
          </p>
        ) : null}
        {imageError ? (
          <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {imageError}
          </p>
        ) : null}
        {imagePreviewUrl ? (
          <div className="relative w-fit">
            <img src={imagePreviewUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
            <button
              type="button"
              aria-label="移除图片"
              onClick={handleRemoveImage}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white"
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="flex min-w-0 items-center gap-2">
          <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-text-muted hover:bg-bg">
            <ImagePlus size={20} aria-hidden="true" />
            <input
              type="file"
              aria-label="添加图片"
              accept={ACCEPTED_MESSAGE_IMAGE_MIME_TYPES.join(",")}
              onChange={handleImageInputChange}
              className="sr-only"
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="sr-only">回复内容</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={1}
              placeholder="以客服身份回复"
              className="h-12 w-full resize-none overflow-y-auto rounded-2xl border border-border bg-bg px-4 py-3 text-base leading-6 text-text focus:outline-none focus:ring-4 focus:ring-primary-light"
            />
          </label>
          <button
            type="submit"
            disabled={sendDisabled}
            className="h-12 shrink-0 rounded-button bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploadingImage ? "上传中…" : replyMutation.isPending ? "发送中…" : "发送"}
          </button>
        </div>
      </form>

      {lightboxImageUrl ? (
        <ImageLightbox
          images={[lightboxImageUrl]}
          initialIndex={0}
          onClose={() => setLightboxImageUrl(null)}
        />
      ) : null}
    </main>
  );
}

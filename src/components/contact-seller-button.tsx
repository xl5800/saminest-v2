import { type MouseEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useCreateDirectConversationMutation } from "../features/conversations/use-create-direct-conversation-mutation";
import { usePostAuthorQuery } from "../features/posts/use-post-author-query";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";

const DEFAULT_ERROR_MESSAGE = "会话创建失败，请稍后重试。";

export interface ContactSellerButtonProps {
  postId: string;
}

/**
 * "联系发布者"按钮：跟 FavoriteButton 是同一套模式——这个按钮嵌在公开页面
 * /post/:id 里（这个路由本身不需要登录），所以登录态判断放在按钮内部，
 * 不是"页面级 RequireAuth"那种情况（那条规则管的是路由，不是这种嵌入式
 * 交互控件）：未登录点击只是跳去 /login，不发起任何请求；已登录点击才调用
 * create_direct_conversation，成功后跳到 /messages/:conversationId——
 * 这个目标路由才是真正需要登录的页面，由 RequireAuth 在路由层守住。
 *
 * 帖子作者本人不应该能给自己发消息（数据库函数也会拒绝），这里在 UI 层
 * 提前隐藏按钮，避免用户点了却看到一个"不能联系自己"的错误。为了避免
 * "作者信息还没查到时按钮先闪一下再消失"，只有在 usePostAuthorQuery 明确
 * 拿到结果（isSuccess）之后才决定渲染什么；查询还在 pending 或失败时，
 * 一律先不渲染任何东西。
 */
export function ContactSellerButton({ postId }: ContactSellerButtonProps) {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: authorId, isSuccess } = usePostAuthorQuery(postId);
  const createConversation = useCreateDirectConversationMutation();
  const [error, setError] = useState<string | null>(null);

  if (!isSuccess) return null;
  if (userId && authorId === userId) return null;

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();

    if (!userId) {
      navigate("/login");
      return;
    }

    if (createConversation.isPending) return;

    setError(null);
    createConversation.mutate(postId, {
      onSuccess: ({ conversationId }) => {
        navigate(`/messages/${conversationId}`);
      },
      onError: (mutationError) => {
        // 跟 report-post-page.tsx 的 REPORT_DUPLICATE 分支同一个模式：账号
        // 受限是一个明确、可操作的失败原因（重试没有用），跟其它未知失败
        // 原因共用一条"请稍后重试"文案会误导用户。
        if (
          mutationError instanceof AppError &&
          mutationError.code === "ACCOUNT_RESTRICTED"
        ) {
          setError(mutationError.message);
        } else {
          setError(DEFAULT_ERROR_MESSAGE);
        }
      }
    });
  }

  return (
    <span>
      <button
        type="button"
        disabled={createConversation.isPending}
        onClick={handleClick}
      >
        {createConversation.isPending ? "创建会话中…" : "联系发布者"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </span>
  );
}

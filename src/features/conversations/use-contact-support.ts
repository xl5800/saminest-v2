import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "../../store/auth-store";
import { useGetOrCreateOwnSystemConversationMutation } from "./use-get-or-create-own-system-conversation-mutation";

const DEFAULT_ERROR_MESSAGE = "打开客服会话失败，请稍后重试。";

/**
 * 联系客服改成真聊天任务卡：把"联系客服"这个动作（拿到/建出自己的
 * system 会话、跳到 /messages/:conversationId）抽成一个共享 hook——现在
 * 有三个入口需要同一套逻辑（"我的"页"帮助与客服"这一行、隐私政策/用户
 * 协议里嵌在正文中的"联系客服"链接），各自的可点击元素长得完全不一样
 * （一个是 GroupRow 整行，两个是段落里的一小段文字），没有理由为了这三种
 * 不同的视觉形态重复实现三遍"点击→调用 RPC→处理错误→跳转"这套逻辑，
 * 只把"点击之后发生什么"抽成 hook，具体渲染成什么样仍然由各自的调用方
 * 决定（照抄 contact-seller-button.tsx"未登录跳 /login、已登录调用
 * mutation、成功跳转、失败展示错误"这同一套模式，只是这次是 hook 形式，
 * 不是一个自带渲染的组件——三个调用点的视觉差异太大，不适合用同一个
 * 组件的 props 参数化）。
 *
 * 不做账号受限判断——理由跟 get_or_create_own_system_conversation() 这个
 * 数据库函数本身一致：账号受限/被封禁的用户尤其可能需要联系客服申诉，
 * 见该函数迁移文件的说明。
 */
export function useContactSupport() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;
  const mutation = useGetOrCreateOwnSystemConversationMutation();
  const [error, setError] = useState<string | null>(null);

  function contactSupport(): void {
    if (!userId) {
      navigate("/login");
      return;
    }
    if (mutation.isPending) return;

    setError(null);
    mutation.mutate(undefined, {
      onSuccess: ({ conversationId }) => {
        navigate(`/messages/${conversationId}`);
      },
      onError: () => {
        setError(DEFAULT_ERROR_MESSAGE);
      }
    });
  }

  return { contactSupport, isPending: mutation.isPending, error };
}

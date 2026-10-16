import { useMyProfileQuery } from "./use-my-profile-query";
import { useAuthStore } from "../../store/auth-store";
import { useNicknamePromptStore } from "../../store/nickname-prompt-store";
import { isDefaultDisplayName } from "../../utils/default-display-name";

/**
 * 用户选了"跳过"之后在这台设备上不再提示（按用户 id 区分）。存在
 * localStorage 里而不是数据库：这只是一个提示的显示偏好，丢了最多再被
 * 提示一次，不值得为它加数据库字段。读写都包 try/catch——隐私模式等
 * 情况下 localStorage 可能不可用，那就当作没跳过过。
 */
const DISMISS_KEY_PREFIX = "nickname-prompt-dismissed:";

export function isNicknamePromptDismissed(userId: string): boolean {
  try {
    return window.localStorage.getItem(`${DISMISS_KEY_PREFIX}${userId}`) === "1";
  } catch {
    return false;
  }
}

export function dismissNicknamePrompt(userId: string): void {
  try {
    window.localStorage.setItem(`${DISMISS_KEY_PREFIX}${userId}`, "1");
  } catch {
    // 存不了就算了，下次再提示一次，不影响主流程。
  }
}

/**
 * 注册登录简化任务卡：注册时自动分配的默认昵称（"同城用户1234"），在用户
 * 第一次报名活动或发私信时——也就是对方第一次会看到这个名字的时候——
 * 提示改一个，可以跳过。
 *
 * runWithNicknameCheck(action)：不需要提示时**同步**直接执行 action（不
 * 改变原来按钮点击的时序）；需要提示时先弹窗，用户保存或跳过后再执行。
 * 资料还没加载出来时不拦，直接执行——不能因为一个提示卡住报名。
 */
export function useNicknamePrompt() {
  const userId = useAuthStore((s) => s.session)?.user.id;
  const { data: profile } = useMyProfileQuery();
  const request = useNicknamePromptStore((s) => s.request);

  const needsPrompt =
    !!userId &&
    !!profile &&
    isDefaultDisplayName(profile.displayName) &&
    !isNicknamePromptDismissed(userId);

  function runWithNicknameCheck(action: () => void): void {
    if (!needsPrompt) {
      action();
      return;
    }
    void request().then(action);
  }

  /** 异步版本，给本来就是 async 的提交函数用（聊天发送）。 */
  async function ensureNickname(): Promise<void> {
    if (needsPrompt) await request();
  }

  return { needsPrompt, runWithNicknameCheck, ensureNickname };
}

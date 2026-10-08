import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { useCreateCommunityPostMutation } from "../../features/community/use-create-community-post-mutation";
import { useDmvCommunityQuery } from "../../features/community/use-dmv-community-query";
import { useJoinCommunityMutation } from "../../features/community/use-join-community-mutation";
import type { CommunityPostType } from "../../repositories/community-repository";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import {
  COMMUNITY_BODY_MAX_LENGTH,
  COMMUNITY_POST_TYPE_OPTIONS,
  COMMUNITY_TITLE_MAX_LENGTH
} from "./community-post-type";

const DEFAULT_ERROR_MESSAGE = "发布失败，请稍后重试。";
const SESSION_EXPIRED_MESSAGE = "登录状态已失效，请重新登录后再发布。";
const COMMUNITY_NOT_READY_MESSAGE = "社区信息还没加载完成，请稍后再试。";
const BODY_REQUIRED_MESSAGE = "请写点内容再发布。";
const BODY_TOO_LONG_MESSAGE = `内容不能超过 ${COMMUNITY_BODY_MAX_LENGTH} 字。`;
const TITLE_TOO_LONG_MESSAGE = `标题不能超过 ${COMMUNITY_TITLE_MAX_LENGTH} 字。`;

/**
 * 社区发帖页（/community/new，RequireAuth 包裹，见 routes.tsx）。
 *
 * 表单字段：帖子类型（下拉，默认"讨论"）、标题（可选，留空提交 null）、
 * 内容（必填，1-10000 字，textarea 随输入自动撑高，写法照抄
 * comment-section.tsx：先把 style.height 重置成 auto 再读 scrollHeight，
 * 封顶高度靠 max-h + overflow-y-auto 内部滚动）。
 *
 * 加入社区：createCommunityPost 依赖 community_posts_insert_own RLS 要求
 * 用户已经是 community_members 成员。这个页面挂载时就静默调一次
 * joinCommunity（防御性——用户可能直接从 URL 进来、没经过 Feed 页那次静默
 * 加入），而且提交时再 await 一次（joinCommunity 对重复加入是幂等的，撞
 * 主键冲突直接吞掉）：这样即使挂载时那次加入还在飞行中、或者失败了，发帖
 * 前也一定已经确认过成员身份，createCommunityPost 里的 42501 才能放心
 * 归因为"账号受限"。
 *
 * 不需要草稿 store：pending-post-form-draft-store.ts 那一套是为了"选地区会
 * 整页跳转、导致表单被卸载重挂载"存在的，这个表单没有任何会导航离开当前
 * 页面的字段。
 */
export function CreateCommunityPostPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: community } = useDmvCommunityQuery();
  const communityId = community?.id;

  const joinCommunity = useJoinCommunityMutation();
  const { mutate: joinCommunityMutate } = joinCommunity;
  const createPostMutation = useCreateCommunityPostMutation();

  const [postType, setPostType] = useState<CommunityPostType>("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!communityId || !userId) return;
    joinCommunityMutate({ communityId, userId });
  }, [communityId, userId, joinCommunityMutate]);

  function handleBodyChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    setBody(event.target.value);
    // 先重置成 "auto" 再读 scrollHeight：不重置的话浏览器还按撑高之前的
    // 高度算 scrollHeight，只会越撑越高，删字缩不回去。
    event.target.style.height = "auto";
    event.target.style.height = `${event.target.scrollHeight}px`;
  }

  async function submitForm(): Promise<void> {
    if (submitting) return;
    setError(null);

    if (!userId) {
      setError(SESSION_EXPIRED_MESSAGE);
      return;
    }
    if (!communityId) {
      setError(COMMUNITY_NOT_READY_MESSAGE);
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setError(BODY_REQUIRED_MESSAGE);
      return;
    }
    if (trimmedBody.length > COMMUNITY_BODY_MAX_LENGTH) {
      setError(BODY_TOO_LONG_MESSAGE);
      return;
    }
    if (trimmedTitle.length > COMMUNITY_TITLE_MAX_LENGTH) {
      setError(TITLE_TOO_LONG_MESSAGE);
      return;
    }

    setSubmitting(true);
    try {
      // 幂等地确认成员身份，见组件顶部注释。
      await joinCommunity.mutateAsync({ communityId, userId });
      const created = await createPostMutation.mutateAsync({
        communityId,
        authorId: userId,
        postType,
        title: trimmedTitle || null,
        body: trimmedBody
      });
      navigate(`/community/post/${created.id}`);
    } catch (submitError) {
      // 账号受限是明确、可操作的失败原因（重试没用，需要联系管理员），跟其它
      // 未知失败原因共用一条"请稍后重试"会误导用户——跟 publish-page.tsx 同
      // 一个处理方式。
      if (submitError instanceof AppError && submitError.code === "ACCOUNT_RESTRICTED") {
        setError(submitError.message);
      } else {
        setError(DEFAULT_ERROR_MESSAGE);
      }
      setSubmitting(false);
    }
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await submitForm();
  }

  return (
    <main className="min-h-dvh bg-bg pb-10">
      <TopBar
        variant="create"
        title="发布到社区"
        onSubmit={() => void submitForm()}
        submitLabel={submitting ? "发布中…" : "发布"}
        submitDisabled={submitting}
      />
      <div className="px-4 pb-6">
        <form onSubmit={handleFormSubmit} noValidate>
          {error ? (
            <p role="alert" className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <label className="mb-4 block">
            <span className="mb-2 block text-xs font-semibold text-text">类型</span>
            <select
              value={postType}
              onChange={(event) => setPostType(event.target.value as CommunityPostType)}
              className="w-full rounded-xl bg-card px-3.5 py-3 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light"
            >
              {COMMUNITY_POST_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-xs font-semibold text-text">标题（可选）</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={COMMUNITY_TITLE_MAX_LENGTH}
              placeholder="起个标题"
              className="w-full rounded-xl bg-card px-3.5 py-3 text-base text-text placeholder:text-text-muted focus:outline-none focus:ring-4 focus:ring-primary-light"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-xs font-semibold text-text">内容</span>
            <textarea
              value={body}
              onChange={handleBodyChange}
              maxLength={COMMUNITY_BODY_MAX_LENGTH}
              placeholder="说点什么吧…"
              className="max-h-[60dvh] min-h-[160px] w-full resize-none overflow-y-auto rounded-xl bg-card px-3.5 py-3 text-base text-text placeholder:text-text-muted focus:outline-none focus:ring-4 focus:ring-primary-light"
            />
          </label>
        </form>
      </div>
    </main>
  );
}

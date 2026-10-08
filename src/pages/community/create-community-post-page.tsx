import { useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PostImagePicker } from "../../components/post-image-picker";
import { TopBar } from "../../components/top-bar";
import { useCreateCommunityPostMutation } from "../../features/community/use-create-community-post-mutation";
import { useDmvCommunityQuery } from "../../features/community/use-dmv-community-query";
import { useJoinCommunityMutation } from "../../features/community/use-join-community-mutation";
import {
  type CreateCommunityPostImageInput,
  insertCommunityPostImages
} from "../../repositories/community-post-images-repository";
import type { CommunityPostType } from "../../repositories/community-repository";
import { communityPostImageStorageService } from "../../services/storage/community-post-image-storage-service";
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
// 社区帖子没有编辑入口，不能像 publish-page.tsx 那样承诺"可以稍后重新上传"。
const IMAGE_FAILURE_MESSAGE = "帖子已发布，但部分图片上传失败。";

/**
 * 开发环境下把图片上传/落库失败的真实错误打印出来，跟 publish-page.tsx 的
 * logDevImageError 同一个理由：用户看到的提示只有一句"部分图片上传失败"，排查
 * 时需要数据库/Storage 返回的真实 code/message。生产环境不打印。
 */
function logDevImageError(stage: string, error: unknown): void {
  if (!import.meta.env.DEV) return;
  if (error instanceof AppError) {
    console.error(`[community-post-image] ${stage}`, {
      code: error.code,
      message: error.message,
      cause: error.cause
    });
  } else {
    console.error(`[community-post-image] ${stage}`, error);
  }
}

/**
 * 上传所选图片并批量落库，容忍部分/全部图片失败——逐字照抄 publish-page.tsx
 * 的 uploadAndInsertPostImages，只换成社区帖子的上传/落库/清理三个函数：
 * - 每张图片单独上传（Promise.allSettled，一张失败不影响其他）；
 * - 上传成功的图片一次性批量 insert 到 community_post_images；
 * - 落库失败时把这一批刚传到 Storage 的孤儿文件删掉（清理失败不盖过原错误）；
 * - 这个函数本身不抛异常，调用方只需要知道"是否全部成功"。
 *
 * sortOrderOffset 固定由调用方传 0：新建的社区帖子不会有已有图片，社区帖子也
 * 没有编辑功能，不需要 getNextPostImageSortOrder 那种"编辑时避开旧图片"的偏移。
 */
async function uploadAndInsertCommunityPostImages(input: {
  files: File[];
  authorId: string;
  communityPostId: string;
  sortOrderOffset: number;
}): Promise<{ allSucceeded: boolean }> {
  const { files, authorId, communityPostId, sortOrderOffset } = input;
  if (files.length === 0) {
    return { allSucceeded: true };
  }

  try {
    const uploadResults = await Promise.allSettled(
      files.map((file) =>
        communityPostImageStorageService.uploadCommunityPostImage({
          file,
          userId: authorId,
          communityPostId
        })
      )
    );

    const successfulInputs: CreateCommunityPostImageInput[] = [];
    let anyUploadFailed = false;

    uploadResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successfulInputs.push({
          communityPostId,
          ownerId: authorId,
          storagePath: result.value.storagePath,
          publicUrl: result.value.publicUrl,
          altText: null,
          width: null,
          height: null,
          sizeBytes: result.value.sizeBytes,
          mimeType: result.value.mimeType,
          sortOrder: sortOrderOffset + index
        });
      } else {
        anyUploadFailed = true;
        logDevImageError("单张图片上传失败", result.reason);
      }
    });

    if (successfulInputs.length === 0) {
      return { allSucceeded: false };
    }

    try {
      await insertCommunityPostImages(successfulInputs);
    } catch (insertError) {
      logDevImageError("community_post_images 批量写入失败", insertError);

      try {
        await communityPostImageStorageService.removeCommunityPostImageFiles(
          successfulInputs.map((successfulInput) => successfulInput.storagePath)
        );
      } catch (cleanupError) {
        logDevImageError("孤儿 Storage 文件清理失败", cleanupError);
      }

      return { allSucceeded: false };
    }

    return { allSucceeded: !anyUploadFailed };
  } catch (error) {
    logDevImageError("图片上传流程异常", error);
    return { allSucceeded: false };
  }
}

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
 * 图片：复用通用的 PostImagePicker（原样接入、不传任何新 prop，数量/大小/格式
 * 上限就是组件自己硬编码的那套，跟普通帖子一样）。帖子本身先创建成功拿到 id，
 * 之后才上传图片（顺序跟 createPost + 图片上传完全一致）；图片部分/全部失败
 * 不回滚帖子、不阻断跳转，只是带一条提示跳到详情页。
 *
 * 不需要草稿 store：pending-post-form-draft-store.ts 那一套是为了"选地区会
 * 整页跳转、导致表单被卸载重挂载"存在的，这个表单没有任何会导航离开当前
 * 页面的字段。
 */
export function CreateCommunityPostPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
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

      // 帖子已经创建成功，之后图片阶段无论成功、部分失败还是整体失败，都只影响
      // 跳转时带的提示，不影响跳转本身（uploadAndInsertCommunityPostImages 内部
      // 已经吞掉自己范围内的所有异常，这里的 try/catch 只是防御性兜底）。
      let imageFailed = false;
      if (imageFiles.length > 0) {
        setUploadingImages(true);
        try {
          const { allSucceeded } = await uploadAndInsertCommunityPostImages({
            files: imageFiles,
            authorId: userId,
            communityPostId: created.id,
            sortOrderOffset: 0
          });
          imageFailed = !allSucceeded;
        } catch {
          imageFailed = true;
        } finally {
          setUploadingImages(false);
          // 创建帖子的 mutation 在图片上传之前就已经失效过一次 Feed 缓存，
          // 这时图片才落库——再失效一次，保证 Feed 封面图/详情页拿到的是上传后的数据。
          void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
          void queryClient.invalidateQueries({ queryKey: ["community-post-detail", created.id] });
        }
      }

      const detailPath = `/community/post/${created.id}`;
      if (imageFailed) {
        navigate(detailPath, { state: { publishSuccessMessage: IMAGE_FAILURE_MESSAGE } });
      } else {
        navigate(detailPath);
      }
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
        submitLabel={uploadingImages ? "上传图片中…" : submitting ? "发布中…" : "发布"}
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

          <div className="mb-4">
            <PostImagePicker
              value={imageFiles}
              onChange={setImageFiles}
              id="community-post-image-picker"
            />
          </div>

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

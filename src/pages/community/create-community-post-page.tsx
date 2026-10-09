import { useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PostImagePicker } from "../../components/post-image-picker";
import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { useCommunityPostDetailQuery } from "../../features/community/use-community-post-detail-query";
import { useCreateCommunityPostMutation } from "../../features/community/use-create-community-post-mutation";
import { useDmvCommunityQuery } from "../../features/community/use-dmv-community-query";
import { useJoinCommunityMutation } from "../../features/community/use-join-community-mutation";
import { useUpdateCommunityPostMutation } from "../../features/community/use-update-community-post-mutation";
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
  COMMUNITY_TITLE_MAX_LENGTH
} from "./community-post-type";

const DEFAULT_ERROR_MESSAGE = "发布失败，请稍后重试。";
const EDIT_DEFAULT_ERROR_MESSAGE = "保存失败，请稍后重试。";
const EDIT_LOAD_ERROR_MESSAGE = "帖子不存在，或没有权限编辑。";
const SESSION_EXPIRED_MESSAGE = "登录状态已失效，请重新登录后再发布。";
const COMMUNITY_NOT_READY_MESSAGE = "社区信息还没加载完成，请稍后再试。";
const BODY_REQUIRED_MESSAGE = "请写点内容再发布。";
const BODY_TOO_LONG_MESSAGE = `内容不能超过 ${COMMUNITY_BODY_MAX_LENGTH} 字。`;
const TITLE_TOO_LONG_MESSAGE = `标题不能超过 ${COMMUNITY_TITLE_MAX_LENGTH} 字。`;
// 编辑模式不处理图片（见组件顶部注释），图片上传失败这条提示只会出现在新建
// 模式，不能像 publish-page.tsx 那样承诺"可以稍后重新上传"。
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
 * sortOrderOffset 固定由调用方传 0：只有新建模式会上传图片，新建的社区帖子不会
 * 有已有图片，不需要 getNextPostImageSortOrder 那种"编辑时避开旧图片"的偏移。
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
 *
 * 我的社区帖子管理（阶段六）：这个组件现在是创建/编辑双模式，照抄
 * publish-page.tsx 的 isEditMode 模式——路由 /community/post/:id/edit 带 :id
 * 就是编辑模式。编辑模式下：
 * - 用 useCommunityPostDetailQuery(id, { enabled: isEditMode }) 查出现有帖子，
 *   第一次拿到数据时用 seededRef 把 postType/title/body 回填进表单一次，之后
 *   后台重新拉取（窗口聚焦等）不再覆盖用户正在编辑的内容。
 * - 帖子不存在/查询失败/不是自己的，统一展示"帖子不存在，或没有权限编辑"、
 *   不渲染表单。"不是自己的"要在前端显式判断（authorId !== userId）：社区
 *   帖子公开可读，详情查询不会因为不是作者就查不到，不能指望查询失败来挡住
 *   别人；真正的写入权限由 updateCommunityPost 的 .eq("author_id") + RLS 兜底。
 * - 不展示图片选择器、不上传图片：编辑已有图片（删除/换序/追加）不在这张卡的
 *   范围内，已有图片原样保留不动。
 * - 不需要 joinCommunity / communityId：帖子已经存在，成员身份和社区归属
 *   都不会被修改。
 */
export function CreateCommunityPostPage() {
  const navigate = useNavigate();
  const { id: communityPostId } = useParams<{ id: string }>();
  const isEditMode = Boolean(communityPostId);
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: community } = useDmvCommunityQuery();
  const communityId = community?.id;

  const joinCommunity = useJoinCommunityMutation();
  const { mutate: joinCommunityMutate } = joinCommunity;
  const createPostMutation = useCreateCommunityPostMutation();
  const updatePostMutation = useUpdateCommunityPostMutation();
  const {
    data: existingPost,
    isPending: existingPostPending,
    isError: existingPostIsError
  } = useCommunityPostDetailQuery(communityPostId ?? "", { enabled: isEditMode });

  const [postType, setPostType] = useState<CommunityPostType>("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const seededRef = useRef(false);

  useEffect(() => {
    if (!isEditMode || seededRef.current || !existingPost) return;
    seededRef.current = true;
    setPostType(existingPost.postType);
    setTitle(existingPost.title ?? "");
    setBody(existingPost.body);
  }, [isEditMode, existingPost]);

  useEffect(() => {
    // 编辑模式不需要（也不应该）静默加入社区。
    if (isEditMode || !communityId || !userId) return;
    joinCommunityMutate({ communityId, userId });
  }, [isEditMode, communityId, userId, joinCommunityMutate]);

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
    if (!isEditMode && !communityId) {
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
      if (isEditMode && communityPostId) {
        await updatePostMutation.mutateAsync({
          id: communityPostId,
          authorId: userId,
          postType,
          title: trimmedTitle || null,
          body: trimmedBody
        });
        navigate(`/community/post/${communityPostId}`);
        return;
      }

      // 幂等地确认成员身份，见组件顶部注释。上面已经保证新建模式下 communityId 有值。
      const resolvedCommunityId = communityId as string;
      await joinCommunity.mutateAsync({ communityId: resolvedCommunityId, userId });
      const created = await createPostMutation.mutateAsync({
        communityId: resolvedCommunityId,
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
        setError(isEditMode ? EDIT_DEFAULT_ERROR_MESSAGE : DEFAULT_ERROR_MESSAGE);
      }
      setSubmitting(false);
    }
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await submitForm();
  }

  // 编辑模式：帖子还在加载 / 加载失败 / 不存在 / 不是自己的——都不渲染表单。
  const loadingExistingPost = isEditMode && existingPostPending;
  const loadError =
    isEditMode &&
    !existingPostPending &&
    (existingPostIsError || !existingPost || existingPost.authorId !== userId);

  const topBarTitle = isEditMode ? "编辑帖子" : "发布到社区";
  const idleSubmitLabel = isEditMode ? "保存修改" : "发布";
  const busySubmitLabel = isEditMode ? "保存中…" : "发布中…";

  if (loadingExistingPost || loadError) {
    return (
      <main className="min-h-dvh bg-bg pb-10">
        <TopBar
          variant="create"
          title={topBarTitle}
          onSubmit={() => undefined}
          submitLabel={idleSubmitLabel}
          submitDisabled
        />
        <div className="px-4 pb-6">
          {loadingExistingPost ? (
            <div role="status">
              <span className="sr-only">加载中…</span>
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="mt-4 h-40 w-full rounded-xl" />
            </div>
          ) : (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {EDIT_LOAD_ERROR_MESSAGE}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-bg pb-10">
      <TopBar
        variant="create"
        title={topBarTitle}
        onSubmit={() => void submitForm()}
        submitLabel={uploadingImages ? "上传图片中…" : submitting ? busySubmitLabel : idleSubmitLabel}
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

          {isEditMode ? null : (
            <div className="mb-4">
              <PostImagePicker
                value={imageFiles}
                onChange={setImageFiles}
                id="community-post-image-picker"
              />
            </div>
          )}

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

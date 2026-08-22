import { type FormEvent, useState } from "react";

import { FeedbackImagePicker } from "../../components/feedback-image-picker";
import { useSubmitFeedbackMutation } from "../../features/feedback/use-submit-feedback-mutation";
import {
  type CreateFeedbackImageInput,
  insertFeedbackImages
} from "../../repositories/feedback-images-repository";
import { FEEDBACK_TYPE_OPTIONS } from "../../repositories/feedback-repository";
import { feedbackImageStorageService } from "../../services/storage/feedback-image-storage-service";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import { getNextPostImageSortOrder } from "../../utils/post-image-sort-order";
import { validateSubmitFeedbackInput } from "./feedback-validation";

const DEFAULT_ERROR_MESSAGE = "提交失败，请稍后重试。";
const SESSION_EXPIRED_MESSAGE = "登录状态已失效，请重新登录后再提交反馈。";
const SUBMIT_SUCCESS_MESSAGE = "已收到，我们会尽快处理";
const SUBMIT_SUCCESS_WITH_IMAGE_FAILURE_MESSAGE =
  "反馈已提交，但部分截图上传失败，不影响反馈本身的处理。";

/**
 * 开发环境下把截图上传/落库失败的真实错误打印出来，不吞掉数据库/Storage
 * 返回的 code/message——照抄 publish-page.tsx 的 logDevImageError，用户
 * 端看到的提示文案始终是简单的那一句，但排查问题不能只有这一句话。
 */
function logDevFeedbackImageError(stage: string, error: unknown): void {
  if (!import.meta.env.DEV) return;
  if (error instanceof AppError) {
    console.error(`[feedback-image] ${stage}`, {
      code: error.code,
      message: error.message,
      cause: error.cause
    });
  } else {
    console.error(`[feedback-image] ${stage}`, error);
  }
}

/**
 * 上传所选截图并批量落库，容忍部分/全部失败——照抄 publish-page.tsx 的
 * uploadAndInsertPostImages：
 * - 每张截图单独上传（Promise.allSettled，一张失败不影响其它已成功的）；
 * - 上传成功的一次性批量 insert 到 feedback_images；
 * - insert 失败时，把这一批刚上传、还没落库的孤儿文件删掉，清理失败
 *   单独记录、不覆盖原始的 insert 错误；
 * - 这个函数本身不抛异常，调用方只需要知道"是否全部成功"。
 */
async function uploadAndInsertFeedbackImages(input: {
  files: File[];
  userId: string;
  feedbackId: string;
}): Promise<{ allSucceeded: boolean }> {
  const { files, userId, feedbackId } = input;
  if (files.length === 0) {
    return { allSucceeded: true };
  }

  try {
    const uploadResults = await Promise.allSettled(
      files.map((file) =>
        feedbackImageStorageService.uploadFeedbackImage({ file, userId, feedbackId })
      )
    );

    const successfulInputs: CreateFeedbackImageInput[] = [];
    let anyUploadFailed = false;
    // 反馈是一次性提交，永远没有"已经存在的活跃截图"（不像编辑帖子可能
    // 已经有历史图片）——传空数组给 getNextPostImageSortOrder 天经地义
    // 总是从 0 开始。用这个函数而不是直接写字面量 0，是为了跟这个项目
    // 统一的 sort_order 计算思路保持一致，也给以后如果要做"给已提交反馈
    // 补传截图"这种功能留一个天然的接入点（到时候传真实的活跃截图列表
    // 进来就是了，这里的调用结构不需要变）。
    const nextSortOrder = getNextPostImageSortOrder([]);

    uploadResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successfulInputs.push({
          feedbackId,
          ownerId: userId,
          storagePath: result.value.storagePath,
          publicUrl: result.value.publicUrl,
          width: null,
          height: null,
          sizeBytes: result.value.sizeBytes,
          mimeType: result.value.mimeType,
          sortOrder: nextSortOrder + index
        });
      } else {
        anyUploadFailed = true;
        logDevFeedbackImageError("单张截图上传失败", result.reason);
      }
    });

    if (successfulInputs.length === 0) {
      return { allSucceeded: false };
    }

    try {
      await insertFeedbackImages(successfulInputs);
    } catch (insertError) {
      logDevFeedbackImageError("feedback_images 批量写入失败", insertError);

      try {
        await feedbackImageStorageService.removeFeedbackImageFiles(
          successfulInputs.map((successfulInput) => successfulInput.storagePath)
        );
      } catch (cleanupError) {
        logDevFeedbackImageError("孤儿 Storage 文件清理失败", cleanupError);
      }

      return { allSucceeded: false };
    }

    return { allSucceeded: !anyUploadFailed };
  } catch (error) {
    logDevFeedbackImageError("截图上传流程异常", error);
    return { allSucceeded: false };
  }
}

/**
 * "联系客服"提交页（/feedback，路由已在 routes.tsx 用 RequireAuth 包裹，
 * 页面内部不做登录检查/跳转，符合 CLAUDE.md 的统一规则）。页面标题从
 * "意见反馈"改名"联系客服"（这次任务改的），路由路径/表单结构/后端表名
 * 都还是 feedback 这个既有概念，不是重新做一个功能，只是给这同一个入口
 * 换了个用户看到的名字。
 *
 * 表单结构照抄 report-post-page.tsx：类型单选、标题/内容必填、成功后用
 * submitted 布尔值切换成功态、账号受限单独判断文案。截图上传照抄
 * publish-page.tsx 的两阶段模式：先创建 feedback 行拿到 feedbackId，
 * 再上传截图并批量落库，截图失败不影响反馈本身已经提交成功这件事，
 * 只影响成功提示的文案（跟发布帖子"帖子已创建但部分图片上传失败"是
 * 同一个用户体验）。
 *
 * 这一轮没有"我的反馈列表"页面，提交成功后不跳转，就地展示成功提示。
 */
export function SubmitFeedbackPage() {
  const session = useAuthStore((s) => s.session);
  const submitFeedbackMutation = useSubmitFeedbackMutation();

  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState(SUBMIT_SUCCESS_MESSAGE);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitFeedbackMutation.isPending || uploadingImages) return;

    setValidationError(null);
    setSubmitError(null);

    const userId = session?.user.id;
    if (!userId) {
      setSubmitError(SESSION_EXPIRED_MESSAGE);
      return;
    }

    const validation = validateSubmitFeedbackInput({ type, title, content });
    if (!validation.success) {
      setValidationError(validation.error.message);
      return;
    }

    let feedbackId: string;
    try {
      const created = await submitFeedbackMutation.mutateAsync({
        userId,
        type: validation.data.type,
        title: validation.data.title,
        content: validation.data.content
      });
      feedbackId = created.id;
    } catch (error) {
      // 账号受限是一个明确、可操作的失败原因（重试没有用，需要联系
      // 管理员），跟其它未知失败原因共用一条"请稍后重试"文案会误导
      // 用户——跟 publish-page.tsx / report-post-page.tsx 是同一个模式。
      setSubmitError(
        error instanceof AppError && error.code === "ACCOUNT_RESTRICTED"
          ? error.message
          : DEFAULT_ERROR_MESSAGE
      );
      return;
    }

    // 反馈本身已经提交成功，之后截图阶段无论成功、部分失败还是整体失败，
    // 都只影响最终展示的提示文案，不影响"反馈已经提交成功"这个事实——跟
    // publish-page.tsx 图片上传阶段的处理原则一致。uploadingImages 无论
    // 走到哪个分支都会在 finally 里恢复。
    let finalMessage = SUBMIT_SUCCESS_MESSAGE;
    try {
      if (images.length > 0) {
        setUploadingImages(true);
        const { allSucceeded } = await uploadAndInsertFeedbackImages({
          files: images,
          userId,
          feedbackId
        });
        if (!allSucceeded) {
          finalMessage = SUBMIT_SUCCESS_WITH_IMAGE_FAILURE_MESSAGE;
        }
      }
    } catch {
      finalMessage = SUBMIT_SUCCESS_WITH_IMAGE_FAILURE_MESSAGE;
    } finally {
      setUploadingImages(false);
    }

    setSuccessMessage(finalMessage);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-xl font-bold text-text">联系客服</h1>
          <p role="status" className="rounded border border-success bg-success/10 px-3 py-2 text-sm text-success">
            {successMessage}
          </p>
        </div>
      </main>
    );
  }

  const isSubmitting = submitFeedbackMutation.isPending || uploadingImages;

  return (
    <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-text">联系客服</h1>
        <form onSubmit={handleSubmit} noValidate>
          {validationError ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {validationError}
            </p>
          ) : null}
          {submitError ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {submitError}
            </p>
          ) : null}
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-medium text-text">反馈类型</legend>
            {FEEDBACK_TYPE_OPTIONS.map((option) => (
              <label key={option.value} className="mb-1 flex items-center gap-2 text-sm text-text">
                <input
                  type="radio"
                  name="feedbackType"
                  value={option.value}
                  checked={type === option.value}
                  onChange={() => setType(option.value)}
                  className="accent-primary"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <label className="mb-4 block text-sm font-medium text-text">
            标题
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            内容
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="mt-1 min-h-[120px] w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <div className="mb-4">
            <FeedbackImagePicker value={images} onChange={setImages} />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadingImages
              ? "上传截图中…"
              : submitFeedbackMutation.isPending
                ? "提交中…"
                : "提交反馈"}
          </button>
        </form>
      </div>
    </main>
  );
}

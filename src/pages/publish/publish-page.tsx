import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PostImagePicker } from "../../components/post-image-picker";
import { useCategoriesQuery } from "../../features/categories/use-categories-query";
import { useLocationsQuery } from "../../features/locations/use-locations-query";
import {
  type CreatePostImageInput,
  insertPostImages
} from "../../repositories/post-images-repository";
import { createPost } from "../../repositories/posts-repository";
import { postImageStorageService } from "../../services/storage/post-image-storage-service";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import {
  CONTACT_METHOD_OPTIONS,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
  validatePublishInput
} from "./publish-validation";

const DEFAULT_ERROR_MESSAGE = "发布失败，请稍后重试。";
const PUBLISH_SUCCESS_MESSAGE = "发布成功，等待审核";
const PUBLISH_SUCCESS_WITH_IMAGE_FAILURE_MESSAGE =
  "帖子已创建，等待审核，但部分图片上传失败，可以稍后重新上传。";

/**
 * 上传所选图片并批量落库，容忍部分/全部图片失败：
 * - 每张图片单独上传（Promise.allSettled，不因为一张失败丢失其他已成功的）；
 * - 上传成功的图片一次性批量 insert 到 post_images；
 * - 这个函数本身不抛异常，调用方只需要知道"是否全部成功"。
 */
async function uploadAndInsertPostImages(input: {
  files: File[];
  authorId: string;
  postId: string;
}): Promise<{ allSucceeded: boolean }> {
  const { files, authorId, postId } = input;
  if (files.length === 0) {
    return { allSucceeded: true };
  }

  try {
    const uploadResults = await Promise.allSettled(
      files.map((file) =>
        postImageStorageService.uploadPostImage({
          file,
          userId: authorId,
          postId
        })
      )
    );

    const successfulInputs: CreatePostImageInput[] = [];
    let anyUploadFailed = false;

    uploadResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successfulInputs.push({
          postId,
          ownerId: authorId,
          storagePath: result.value.storagePath,
          publicUrl: result.value.publicUrl,
          altText: null,
          width: null,
          height: null,
          sizeBytes: result.value.sizeBytes,
          mimeType: result.value.mimeType,
          sortOrder: index
        });
      } else {
        anyUploadFailed = true;
      }
    });

    if (successfulInputs.length === 0) {
      return { allSucceeded: false };
    }

    try {
      await insertPostImages(successfulInputs);
    } catch {
      // 这一批图片的行都没有落库，全部算失败。
      return { allSucceeded: false };
    }

    return { allSucceeded: !anyUploadFailed };
  } catch {
    return { allSucceeded: false };
  }
}

/**
 * 发布表单：基本信息 + 图片上传（见 PRD 第九章发布流程）。
 *
 * 图片上传流程（Phase 2）：帖子（posts 行）创建成功之后才会处理图片，
 * 图片上传/落库失败不会回滚帖子、不会阻止跳转，只影响跳转时的提示文案，
 * 详见 handleSubmit 里的注释。
 *
 * 安全边界：
 * - author_id 不是表单字段，只从 auth-store 里当前登录用户的 session 读取，
 *   用户没有任何方式在表单上编辑或伪造它。
 * - status 在提交时不由这个组件决定，createPost() 内部把它硬编码成
 *   'pending'，这里完全不暴露状态相关的 UI，防止绕过审核流程
 *   （见 Tables.md 9.8："不能把状态直接改为 approved"）。
 */
export function PublishPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);

  const {
    data: categories,
    isPending: categoriesPending,
    isError: categoriesError
  } = useCategoriesQuery();
  const {
    data: locations,
    isPending: locationsPending,
    isError: locationsError
  } = useLocationsQuery();

  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setError(null);

    const authorId = session?.user.id;
    if (!authorId) {
      setError("登录状态已失效，请重新登录后再发布。");
      return;
    }

    const validation = validatePublishInput({
      categoryId,
      locationId,
      title,
      description,
      price,
      contactMethod,
      contactValue
    });
    if (!validation.success) {
      setError(validation.error.message);
      return;
    }

    setSubmitting(true);
    let postId: string;
    try {
      const created = await createPost({
        authorId,
        categoryId: validation.data.categoryId,
        locationId: validation.data.locationId,
        title: validation.data.title,
        description: validation.data.description,
        priceAmount: validation.data.priceAmount,
        contactMethod: validation.data.contactMethod,
        contactValue: validation.data.contactValue
      });
      postId = created.id;
    } catch (submitError) {
      // 跟 report-post-page.tsx 的 REPORT_DUPLICATE 分支同一个模式：
      // 账号受限是一个明确、可操作的失败原因（重试没有用，需要联系
      // 管理员），跟其它未知失败原因共用一条"请稍后重试"文案会误导用户。
      if (submitError instanceof AppError && submitError.code === "ACCOUNT_RESTRICTED") {
        setError(submitError.message);
      } else {
        setError(DEFAULT_ERROR_MESSAGE);
      }
      setSubmitting(false);
      return;
    }

    // 帖子已经创建成功，之后图片阶段无论成功、部分失败还是整体失败，
    // 都只影响跳转时带的提示信息，不影响跳转本身、不回滚帖子。
    // uploadAndInsertPostImages 内部已经吞掉自己范围内的所有异常，这里额外
    // 包一层 try/catch 只是防御性的兜底，确保这个阶段绝不会阻止跳转。
    let publishSuccessMessage = PUBLISH_SUCCESS_MESSAGE;
    try {
      if (images.length > 0) {
        setUploadingImages(true);
        const { allSucceeded } = await uploadAndInsertPostImages({
          files: images,
          authorId,
          postId
        });
        if (!allSucceeded) {
          publishSuccessMessage = PUBLISH_SUCCESS_WITH_IMAGE_FAILURE_MESSAGE;
        }
      }
    } catch {
      publishSuccessMessage = PUBLISH_SUCCESS_WITH_IMAGE_FAILURE_MESSAGE;
    } finally {
      setUploadingImages(false);
      navigate(`/post/${postId}`, {
        replace: true,
        state: { publishSuccessMessage }
      });
      setSubmitting(false);
    }
  }

  return (
    <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-text">发布帖子</h1>
        <form onSubmit={handleSubmit} noValidate>
          {error ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <label className="mb-4 block text-sm font-medium text-text">
            分类
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={categoriesPending}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">请选择分类</option>
              {(categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nameZh}
                </option>
              ))}
            </select>
          </label>
          {categoriesError ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              分类加载失败，请刷新页面重试。
            </p>
          ) : null}
          <label className="mb-4 block text-sm font-medium text-text">
            地区
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              disabled={locationsPending}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">不限地区</option>
              {(locations ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          {locationsError ? (
            <p className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              地区加载失败，请刷新页面重试。
            </p>
          ) : null}
          <label className="mb-4 block text-sm font-medium text-text">
            标题
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={TITLE_MIN_LENGTH}
              maxLength={TITLE_MAX_LENGTH}
              required
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            描述
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              minLength={DESCRIPTION_MIN_LENGTH}
              maxLength={DESCRIPTION_MAX_LENGTH}
              required
              className="mt-1 min-h-[120px] w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            价格（可选）
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            联系方式类型
            <select
              value={contactMethod}
              onChange={(event) => setContactMethod(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">请选择联系方式</option>
              {CONTACT_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            联系方式内容
            <input
              type="text"
              value={contactValue}
              onChange={(event) => setContactValue(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <PostImagePicker value={images} onChange={setImages} />
          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadingImages ? "上传图片中…" : submitting ? "发布中…" : "发布"}
          </button>
        </form>
      </div>
    </main>
  );
}

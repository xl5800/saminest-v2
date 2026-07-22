import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PostImagePicker } from "../../components/post-image-picker";
import { useCategoriesQuery } from "../../features/categories/use-categories-query";
import { useLocationsQuery } from "../../features/locations/use-locations-query";
import { useRemovePostImageMutation } from "../../features/my-posts/use-remove-post-image-mutation";
import { useUpdatePostMutation } from "../../features/my-posts/use-update-post-mutation";
import { usePostDetailQuery } from "../../features/posts/use-post-detail-query";
import {
  type CreatePostImageInput,
  insertPostImages
} from "../../repositories/post-images-repository";
import { createPost, type PostDetailImage } from "../../repositories/posts-repository";
import { postImageStorageService } from "../../services/storage/post-image-storage-service";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import {
  CONTACT_METHOD_OPTIONS,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  LOCATION_TEXT_MAX_LENGTH,
  OTHER_LOCATION_VALUE,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
  validatePublishInput
} from "./publish-validation";

const DEFAULT_ERROR_MESSAGE = "发布失败，请稍后重试。";
const PUBLISH_SUCCESS_MESSAGE = "发布成功，等待审核";
const PUBLISH_SUCCESS_WITH_IMAGE_FAILURE_MESSAGE =
  "帖子已创建，等待审核，但部分图片上传失败，可以稍后重新上传。";
const EDIT_SUCCESS_MESSAGE = "修改已保存";
const EDIT_SUCCESS_WITH_IMAGE_FAILURE_MESSAGE =
  "修改已保存，但部分图片上传失败，可以稍后重新上传。";
const EDIT_LOAD_FAILED_MESSAGE = "帖子不存在，或没有权限编辑。";
const IMAGE_REMOVE_FAILED_MESSAGE = "图片删除失败，请稍后重试。";

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
  sortOrderOffset: number;
}): Promise<{ allSucceeded: boolean }> {
  const { files, authorId, postId, sortOrderOffset } = input;
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
          sortOrder: sortOrderOffset + index
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
 * 这个组件同时承担新建和编辑两种模式（阶段六），由路由 `:id` 参数区分：
 * - `/publish`：新建，postId 是 undefined，提交时调用 createPost()。
 * - `/publish/:id`：编辑，挂载时用 usePostDetailQuery(postId) 回填表单
 *   字段（分类/地区/标题/描述/价格/联系方式/已上传的图片），提交时调用
 *   useUpdatePostMutation() 而不是 createPost()。usePostDetailQuery 底层
 *   就是 getPostDetail()，依赖 posts_select_public_or_own_or_admin 这条
 *   RLS 策略做权限判断——不是自己帖子（或已被软删除）时会返回 null，
 *   页面显示"帖子不存在，或没有权限编辑"，不渲染表单，不会像改动前那样
 *   悄悄展示一个空的新建表单。
 *
 * 表单字段回填只做一次（seededRef 挡住之后的重复赋值）：这几个 useState
 * 都是受控输入，用户改动之后 usePostDetailQuery 如果因为窗口重新聚焦等
 * 原因在后台重新拉取，不应该把用户正在编辑的内容覆盖掉。
 *
 * 图片上传流程（Phase 2）：新建时，帖子（posts 行）创建成功之后才会处理
 * 图片；编辑时，已上传的图片（existingImages）单独展示、单独删除
 * （useRemovePostImageMutation，立即生效，不需要等表单整体提交），这次
 * 表单提交只处理"新增选择的图片"这一部分。两种模式下，图片上传/落库
 * 失败都不会回滚帖子本身、不会阻止跳转，只影响跳转时的提示文案。
 *
 * 安全边界：
 * - author_id 不是表单字段，只从 auth-store 里当前登录用户的 session 读取，
 *   用户没有任何方式在表单上编辑或伪造它。
 * - status 在新建时不由这个组件决定，createPost() 内部把它硬编码成
 *   'pending'；编辑时 updatePost() 只有原状态是 'approved' 才会顺带转回
 *   'pending'，这个组件只负责把 usePostDetailQuery() 查到的原始 status
 *   转交给 updatePost() 的 currentStatus 参数，不在这里做任何状态判断。
 */
export function PublishPage() {
  const navigate = useNavigate();
  const { id: postId } = useParams<{ id: string }>();
  const isEditMode = Boolean(postId);
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
  const {
    data: existingPost,
    isPending: existingPostPending,
    isError: existingPostIsError
  } = usePostDetailQuery(postId ?? "", { enabled: isEditMode });
  const updatePostMutation = useUpdatePostMutation();
  const removePostImageMutation = useRemovePostImageMutation();

  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locationText, setLocationText] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<PostDetailImage[]>([]);
  const [removingImageId, setRemovingImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  const seededRef = useRef(false);

  useEffect(() => {
    if (!isEditMode || seededRef.current || existingPost == null) {
      return;
    }
    seededRef.current = true;

    setCategoryId(existingPost.categoryId);
    if (existingPost.locationId) {
      setLocationId(existingPost.locationId);
      setLocationText("");
    } else if (existingPost.locationText) {
      setLocationId(OTHER_LOCATION_VALUE);
      setLocationText(existingPost.locationText);
    } else {
      setLocationId("");
      setLocationText("");
    }
    setTitle(existingPost.title);
    setDescription(existingPost.description);
    setPrice(existingPost.priceAmount !== null ? String(existingPost.priceAmount) : "");
    setContactMethod(existingPost.contactMethod ?? "");
    setContactValue(existingPost.contactValue ?? "");
    setExistingImages(existingPost.images);
  }, [isEditMode, existingPost]);

  const loadingExistingPost = isEditMode && existingPostPending;
  const loadError = isEditMode && !existingPostPending && (existingPostIsError || existingPost === null);

  async function handleRemoveExistingImage(imageId: string) {
    if (removingImageId) return;
    setRemovingImageId(imageId);
    setError(null);
    try {
      await removePostImageMutation.mutateAsync(imageId);
      setExistingImages((prev) => prev.filter((image) => image.id !== imageId));
    } catch {
      setError(IMAGE_REMOVE_FAILED_MESSAGE);
    } finally {
      setRemovingImageId(null);
    }
  }

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
      locationText,
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
    let resolvedPostId: string;

    if (isEditMode && postId) {
      try {
        await updatePostMutation.mutateAsync({
          postId,
          currentStatus: existingPost?.status ?? "",
          categoryId: validation.data.categoryId,
          locationId: validation.data.locationId,
          locationText: validation.data.locationText,
          title: validation.data.title,
          description: validation.data.description,
          priceAmount: validation.data.priceAmount,
          contactMethod: validation.data.contactMethod,
          contactValue: validation.data.contactValue
        });
      } catch (submitError) {
        setError(
          submitError instanceof AppError ? submitError.message : DEFAULT_ERROR_MESSAGE
        );
        setSubmitting(false);
        return;
      }
      resolvedPostId = postId;
    } else {
      try {
        const created = await createPost({
          authorId,
          categoryId: validation.data.categoryId,
          locationId: validation.data.locationId,
          locationText: validation.data.locationText,
          title: validation.data.title,
          description: validation.data.description,
          priceAmount: validation.data.priceAmount,
          contactMethod: validation.data.contactMethod,
          contactValue: validation.data.contactValue
        });
        resolvedPostId = created.id;
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
    }

    // 帖子已经创建/更新成功，之后图片阶段无论成功、部分失败还是整体失败，
    // 都只影响跳转时带的提示信息，不影响跳转本身。
    // uploadAndInsertPostImages 内部已经吞掉自己范围内的所有异常，这里额外
    // 包一层 try/catch 只是防御性的兜底，确保这个阶段绝不会阻止跳转。
    let publishSuccessMessage = isEditMode ? EDIT_SUCCESS_MESSAGE : PUBLISH_SUCCESS_MESSAGE;
    const imageFailureMessage = isEditMode
      ? EDIT_SUCCESS_WITH_IMAGE_FAILURE_MESSAGE
      : PUBLISH_SUCCESS_WITH_IMAGE_FAILURE_MESSAGE;
    try {
      if (images.length > 0) {
        setUploadingImages(true);
        const { allSucceeded } = await uploadAndInsertPostImages({
          files: images,
          authorId,
          postId: resolvedPostId,
          sortOrderOffset: existingImages.length
        });
        if (!allSucceeded) {
          publishSuccessMessage = imageFailureMessage;
        }
      }
    } catch {
      publishSuccessMessage = imageFailureMessage;
    } finally {
      setUploadingImages(false);
      navigate(`/post/${resolvedPostId}`, {
        replace: true,
        state: { publishSuccessMessage }
      });
      setSubmitting(false);
    }
  }

  if (loadingExistingPost) {
    return (
      <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <div className="w-full max-w-2xl rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="text-sm text-text-muted">加载中…</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
        <div className="w-full max-w-2xl rounded-lg border border-border bg-white p-6 shadow-sm">
          <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {EDIT_LOAD_FAILED_MESSAGE}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex justify-center px-4 py-10 pb-20 md:pb-10">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-text">
          {isEditMode ? "编辑帖子" : "发布帖子"}
        </h1>
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
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
          <label className="mb-1 block text-sm font-medium text-text">
            地区
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              disabled={locationsPending}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">不限地区</option>
              {(locations ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
              <option value={OTHER_LOCATION_VALUE}>其他（手动输入）</option>
            </select>
          </label>
          {locationId === OTHER_LOCATION_VALUE ? (
            <input
              type="text"
              value={locationText}
              onChange={(event) => setLocationText(event.target.value)}
              maxLength={LOCATION_TEXT_MAX_LENGTH}
              placeholder="请输入地区名称"
              aria-label="地区名称"
              className="mb-4 mt-2 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <div className="mb-4" />
          )}
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
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
              className="mt-1 min-h-[120px] w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-text">
            联系方式类型
            <select
              value={contactMethod}
              onChange={(event) => setContactMethod(event.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
              className="mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          {isEditMode && existingImages.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-text">已上传的图片</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {existingImages.map((image) => (
                  <li key={image.id} className="relative rounded border border-border p-1">
                    {image.publicUrl ? (
                      <img
                        src={image.publicUrl}
                        alt=""
                        width={80}
                        height={80}
                        className="h-20 w-20 rounded object-cover"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleRemoveExistingImage(image.id)}
                      disabled={removingImageId === image.id}
                      className="mt-1 w-full rounded border border-danger px-1 py-0.5 text-xs text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {removingImageId === image.id ? "删除中…" : "删除"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <PostImagePicker value={images} onChange={setImages} />
          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadingImages
              ? "上传图片中…"
              : submitting
                ? isEditMode
                  ? "保存中…"
                  : "发布中…"
                : isEditMode
                  ? "保存修改"
                  : "发布"}
          </button>
        </form>
      </div>
    </main>
  );
}

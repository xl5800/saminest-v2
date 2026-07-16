import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useCategoriesQuery } from "../../features/categories/use-categories-query";
import { useLocationsQuery } from "../../features/locations/use-locations-query";
import { createPost } from "../../repositories/posts-repository";
import { useAuthStore } from "../../store/auth-store";
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

/**
 * Phase 1 发布表单：只做基本信息，不含图片上传（见 PRD 第九章发布流程，
 * 图片上传是单独的后续任务）。
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    try {
      const { id } = await createPost({
        authorId,
        categoryId: validation.data.categoryId,
        locationId: validation.data.locationId,
        title: validation.data.title,
        description: validation.data.description,
        priceAmount: validation.data.priceAmount,
        contactMethod: validation.data.contactMethod,
        contactValue: validation.data.contactValue
      });
      navigate(`/post/${id}`, {
        replace: true,
        state: { publishSuccessMessage: PUBLISH_SUCCESS_MESSAGE }
      });
    } catch {
      setError(DEFAULT_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>发布帖子</h1>
      <form onSubmit={handleSubmit} noValidate>
        {error ? <p role="alert">{error}</p> : null}
        <label>
          分类
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            disabled={categoriesPending}
            required
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
          <p role="alert">分类加载失败，请刷新页面重试。</p>
        ) : null}
        <label>
          地区
          <select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            disabled={locationsPending}
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
          <p role="alert">地区加载失败，请刷新页面重试。</p>
        ) : null}
        <label>
          标题
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={TITLE_MIN_LENGTH}
            maxLength={TITLE_MAX_LENGTH}
            required
          />
        </label>
        <label>
          描述
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            minLength={DESCRIPTION_MIN_LENGTH}
            maxLength={DESCRIPTION_MAX_LENGTH}
            required
          />
        </label>
        <label>
          价格（可选）
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        <label>
          联系方式类型
          <select
            value={contactMethod}
            onChange={(event) => setContactMethod(event.target.value)}
          >
            <option value="">请选择联系方式</option>
            {CONTACT_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          联系方式内容
          <input
            type="text"
            value={contactValue}
            onChange={(event) => setContactValue(event.target.value)}
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "发布中…" : "发布"}
        </button>
      </form>
    </main>
  );
}

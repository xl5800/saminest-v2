import { type ChangeEvent, useEffect, useState } from "react";

import {
  ACCEPTED_IMAGE_MIME_TYPES,
  describeUnsupportedImageMimeType,
  isAcceptedImageMimeType
} from "../utils/image-mime-validation";

/**
 * 头像选择组件（编辑资料页用）。照抄 post-image-picker.tsx 的校验/拍照/
 * 相册选择模式（同一套 accept="image/*" capture="environment" 做拍照、
 * 不带 capture 的 <input> 做相册选择），但只选一张、没有"已选列表"那一套
 * UI——选中就立刻替换掉当前预览，不需要 post-image-picker.tsx 那种
 * 数量上限/批次内去重逻辑（头像天然只有一张）。
 *
 * MIME 类型判断复用 image-mime-validation.ts（跟 post-image-picker.tsx
 * 共用同一份逻辑，包括 HEIC 专属提示文案），不重新写一遍——见那个文件
 * 顶部关于"为什么拆出来、为什么只拆 MIME 判断这一小段"的说明。大小上限/
 * 空文件这两条规则两边结构相似但没有共用同一个常量：这里的 20MB 是照抄
 * avatars Storage bucket 自己配置的 file_size_limit（见
 * supabase/migrations/20260818070203_storage_avatars_bucket_and_policies.sql），
 * 跟 post-image-picker.tsx 的 MAX_POST_IMAGE_SIZE_BYTES 只是恰好数值相同，
 * 语义上是两个独立的业务上限，不应该共享同一个符号。
 *
 * 这个组件只负责"选择、校验、预览"，不负责上传——跟 post-image-picker.tsx
 * 是同一个分工，实际上传由调用方（edit-profile-page.tsx）在选中新文件后
 * 自己调用 avatar-storage-service.ts。
 *
 * 预览三态：已经选中了新文件 → 显示这张新文件的本地预览；没选新文件但
 * 已有远程头像（currentAvatarUrl）→ 显示远程头像；都没有 → 显示
 * displayNameInitial 这个昵称首字母圆形占位，跟这个仓库其它展示头像的
 * 地方（profile-page.tsx 等）用同一套占位逻辑。
 */
export const MAX_AVATAR_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_AVATAR_SIZE_MB = MAX_AVATAR_SIZE_BYTES / (1024 * 1024);

export interface AvatarPickerProps {
  value: File | null;
  onChange: (file: File | null) => void;
  currentAvatarUrl: string | null;
  displayNameInitial: string;
  id?: string;
}

function validateAvatarFile(file: File): string | null {
  if (!isAcceptedImageMimeType(file.type)) {
    return describeUnsupportedImageMimeType(file);
  }
  if (file.size === 0) {
    return `${file.name}：文件是空的，无法上传。`;
  }
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return `${file.name}：文件大小不能超过 ${MAX_AVATAR_SIZE_MB}MB。`;
  }
  return null;
}

export function AvatarPicker({
  value,
  onChange,
  currentAvatarUrl,
  displayNameInitial,
  id = "avatar-picker"
}: AvatarPickerProps) {
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 只有选中了新文件（value 不为 null）时才需要生成/撤销本地预览地址，
  // 没有新文件时直接显示 currentAvatarUrl，不需要 createObjectURL。
  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [value]);

  function handleIncomingFile(file: File | undefined) {
    if (!file) return;

    const validationError = validateAvatarFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    onChange(file);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // 允许再次选中同一个文件也能触发 change 事件。
    event.target.value = "";
    handleIncomingFile(file);
  }

  const galleryInputId = `${id}-gallery-input`;
  const cameraInputId = `${id}-camera-input`;
  const displayedPreviewUrl = previewUrl ?? currentAvatarUrl;

  return (
    <div>
      <label htmlFor={galleryInputId} className="inline-block cursor-pointer">
        {displayedPreviewUrl ? (
          <img
            src={displayedPreviewUrl}
            alt=""
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-20 w-20 items-center justify-center rounded-full bg-bg text-2xl font-semibold text-text-muted"
          >
            {displayNameInitial}
          </div>
        )}
      </label>

      <div className="mt-2 flex gap-2">
        <label
          htmlFor={galleryInputId}
          className="cursor-pointer rounded border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
        >
          更换头像
          <input
            id={galleryInputId}
            type="file"
            accept={ACCEPTED_IMAGE_MIME_TYPES.join(",")}
            onChange={handleInputChange}
            className="sr-only"
          />
        </label>
        <label
          htmlFor={cameraInputId}
          className="cursor-pointer rounded border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
        >
          拍照
          <input
            id={cameraInputId}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleInputChange}
            className="sr-only"
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

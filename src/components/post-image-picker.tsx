import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useState
} from "react";

import {
  ACCEPTED_IMAGE_MIME_TYPES,
  describeUnsupportedImageMimeType,
  isAcceptedImageMimeType
} from "../utils/image-mime-validation";

/**
 * 发布表单图片上传的选择/预览组件（第一阶段，见
 * docs/02_SystemDesign/Architecture.md 15 节图片上传架构）。
 *
 * 这个组件只负责"选择、校验、预览、移除"，不负责上传：
 * - 不调用 post-image-storage-service 或 post-images-repository。
 * - 实际上传发生在第二阶段，接入 publish-page.tsx 提交流程时才会用到。
 *
 * 校验规则（数量上限、文件类型、大小、空文件、批次内重复）都是产品已确认的
 * 决定，这里不额外发明更宽松或更严格的规则。
 *
 * MAX_POST_IMAGE_SIZE_BYTES 这里是 20MB，不是真正的业务上限——真正的
 * "上传后不超过多大"由 post-image-storage-service.ts 里上传前的压缩
 * 负责（见该文件 compressImageToWebp）。这里只是选图阶段的兜底上限，
 * 用来拦住明显异常/损坏的文件，不应该拦住手机相机拍出来的正常原图
 * （iPhone 原图常见 8-15MB，压缩必须有机会先跑一遍才有意义，选图阶段
 * 卡在 5MB 会让压缩完全没有介入的机会）。
 */
export const MAX_POST_IMAGES = 9;
export const MAX_POST_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_POST_IMAGE_SIZE_MB = MAX_POST_IMAGE_SIZE_BYTES / (1024 * 1024);
// MIME 类型判断（含 HEIC 专属提示文案）挪到 image-mime-validation.ts，
// avatar-picker.tsx 头像选择组件共用同一份逻辑，不各自维护一份——见那个
// 文件顶部的说明。这里保留 ACCEPTED_POST_IMAGE_MIME_TYPES 这个导出名字
// （给下面 <input accept={...}> 用），值直接来自共享模块。
export const ACCEPTED_POST_IMAGE_MIME_TYPES = ACCEPTED_IMAGE_MIME_TYPES;

function isSameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size;
}

function isDuplicateOf(file: File, others: File[]): boolean {
  return others.some((other) => isSameFile(file, other));
}

interface ValidateFilesResult {
  accepted: File[];
  errors: string[];
}

/**
 * 纯函数，方便单独测试规则，也方便被 input 的 change 事件和拖拽的 drop
 * 事件共用同一套校验逻辑。
 */
function validateIncomingFiles(
  candidateFiles: File[],
  existingFiles: File[]
): ValidateFilesResult {
  const errors: string[] = [];
  const validated: File[] = [];

  for (const file of candidateFiles) {
    if (!isAcceptedImageMimeType(file.type)) {
      errors.push(describeUnsupportedImageMimeType(file));
      continue;
    }
    if (file.size === 0) {
      errors.push(`${file.name}：文件是空的，无法上传。`);
      continue;
    }
    if (file.size > MAX_POST_IMAGE_SIZE_BYTES) {
      errors.push(`${file.name}：文件大小不能超过 ${MAX_POST_IMAGE_SIZE_MB}MB。`);
      continue;
    }
    if (isDuplicateOf(file, existingFiles) || isDuplicateOf(file, validated)) {
      errors.push(`${file.name}：和已选择的图片重复。`);
      continue;
    }
    validated.push(file);
  }

  const remainingSlots = Math.max(0, MAX_POST_IMAGES - existingFiles.length);
  let accepted = validated;
  if (validated.length > remainingSlots) {
    const overflowCount = validated.length - remainingSlots;
    accepted = validated.slice(0, remainingSlots);
    errors.push(
      `最多只能上传 ${MAX_POST_IMAGES} 张图片，超出的 ${overflowCount} 张已被忽略。`
    );
  }

  return { accepted, errors };
}

export interface PostImagePickerProps {
  value: File[];
  onChange: (files: File[]) => void;
  id?: string;
}

export function PostImagePicker({
  value,
  onChange,
  id = "post-image-picker"
}: PostImagePickerProps) {
  const [errors, setErrors] = useState<string[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  // 每次选中的文件列表变化时重新生成预览地址，并在下一次变化/卸载时
  // 撤销上一批地址，避免 URL.createObjectURL 造成的内存泄漏。
  useEffect(() => {
    const urls = value.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [value]);

  function handleIncomingFiles(candidateFiles: File[]) {
    if (candidateFiles.length === 0) return;

    const { accepted, errors: nextErrors } = validateIncomingFiles(
      candidateFiles,
      value
    );

    setErrors(nextErrors);
    if (accepted.length > 0) {
      onChange([...value, ...accepted]);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // 允许再次选中同一个文件也能触发 change 事件。
    event.target.value = "";
    handleIncomingFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files ?? []);
    handleIncomingFiles(files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handleRemove(indexToRemove: number) {
    onChange(value.filter((_, index) => index !== indexToRemove));
  }

  const inputId = `${id}-input`;
  const cameraInputId = `${id}-camera-input`;

  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block cursor-pointer text-sm font-medium text-text">
        上传图片（最多 {MAX_POST_IMAGES} 张，支持 JPEG/PNG/WEBP，单张不超过 {MAX_POST_IMAGE_SIZE_MB}MB）
        <div
          data-testid="post-image-drop-zone"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="mt-2 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-border bg-bg px-4 py-8 text-center font-normal"
        >
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_POST_IMAGE_MIME_TYPES.join(",")}
            multiple
            onChange={handleInputChange}
            className="sr-only"
          />
          <p className="text-sm text-text-muted">拖拽图片到此处，或点击从相册选择</p>
        </div>
      </label>
      <label
        htmlFor={cameraInputId}
        className="mt-2 inline-block cursor-pointer rounded border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg"
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
      {errors.length > 0 ? (
        <div role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors.map((message) => (
            <p key={message} className="leading-relaxed">
              {message}
            </p>
          ))}
        </div>
      ) : null}
      {value.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="relative rounded border border-border p-1"
            >
              {previewUrls[index] ? (
                <img
                  src={previewUrls[index]}
                  alt={file.name}
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded object-cover"
                />
              ) : null}
              <span className="mt-1 block truncate text-xs text-text-muted">{file.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="mt-1 w-full rounded border border-danger px-1 py-0.5 text-xs text-danger hover:bg-danger/10"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

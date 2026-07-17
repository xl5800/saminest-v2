import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useState
} from "react";

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
 */
export const MAX_POST_IMAGES = 9;
export const MAX_POST_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_POST_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

type AcceptedMimeType = (typeof ACCEPTED_POST_IMAGE_MIME_TYPES)[number];

function isAcceptedMimeType(type: string): type is AcceptedMimeType {
  return (ACCEPTED_POST_IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

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
    if (!isAcceptedMimeType(file.type)) {
      errors.push(`${file.name}：只支持 JPEG、PNG 或 WEBP 格式的图片。`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`${file.name}：文件是空的，无法上传。`);
      continue;
    }
    if (file.size > MAX_POST_IMAGE_SIZE_BYTES) {
      errors.push(`${file.name}：文件大小不能超过 5MB。`);
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

  return (
    <div>
      <label htmlFor={inputId}>
        上传图片（最多 {MAX_POST_IMAGES} 张，支持 JPEG/PNG/WEBP，单张不超过 5MB）
      </label>
      <div
        data-testid="post-image-drop-zone"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          id={inputId}
          type="file"
          accept={ACCEPTED_POST_IMAGE_MIME_TYPES.join(",")}
          multiple
          onChange={handleInputChange}
        />
        <p>拖拽图片到此处，或点击选择文件</p>
      </div>
      {errors.length > 0 ? (
        <div role="alert">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      {value.length > 0 ? (
        <ul>
          {value.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`}>
              {previewUrls[index] ? (
                <img src={previewUrls[index]} alt={file.name} width={80} height={80} />
              ) : null}
              <span>{file.name}</span>
              <button type="button" onClick={() => handleRemove(index)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

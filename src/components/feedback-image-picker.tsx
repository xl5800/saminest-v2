import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useState
} from "react";

/**
 * 提交反馈表单的截图选择/预览组件，只负责"选择、校验、预览、移除"，不负责
 * 上传（跟 post-image-picker.tsx 是同一个职责边界）。
 *
 * 为什么新建一个组件，而不是改造/复用 post-image-picker.tsx：
 * - PostImagePicker 已经有一整套针对"帖子发布图片"场景的测试（数量上限
 *   9 张、拍照入口等），命名（MAX_POST_IMAGES、data-testid="post-image-
 *   drop-zone"）和文案（"上传图片"）都跟"帖子"绑定，硬把它改造成"数量上限
 *   3 张、没有拍照入口"的反馈截图场景，要么加一堆 props 参数化每一个数字
 *   /文案/是否显示拍照按钮，把一个本来简单的组件变复杂；要么直接改现有
 *   常量/文案，会影响发布表单本身、牵动它现成的测试——两条路都不划算。
 * - 反馈截图场景本身也更简单：不需要拍照入口（截图不是拍出来的，现实里
 *   几乎都是从相册选已经存在的截图；真要拍别的照片，用户可以先用系统
 *   相机拍完，再从相册选，不需要在这个精简组件里重复实现一遍拍照逻辑），
 *   数量上限也更低（3 张 vs 9 张）。
 * - 校验规则本身（MIME 类型、大小上限、HEIC 提示、空文件、批次内重复）
 *   参照 post-image-picker.tsx 的思路，但这次按指令要求不强制代码复用，
 *   两边各自独立演进，互不影响。
 *
 * MAX_FEEDBACK_IMAGE_SIZE_BYTES 20MB 是选图阶段的兜底上限（拦明显异常/
 * 损坏的文件），不是真正的业务上限——真正压下来的体积由
 * feedback-image-storage-service.ts 上传前的压缩负责，跟
 * post-image-picker.tsx 的 20MB 是同一个理由（手机原图常见 8-15MB，
 * 选图阶段卡太低会让压缩没有机会介入）。
 */
export const MAX_FEEDBACK_IMAGES = 3;
export const MAX_FEEDBACK_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_FEEDBACK_IMAGE_SIZE_MB = MAX_FEEDBACK_IMAGE_SIZE_BYTES / (1024 * 1024);
export const ACCEPTED_FEEDBACK_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

const HEIC_MIME_TYPES = ["image/heic", "image/heif"];

type AcceptedMimeType = (typeof ACCEPTED_FEEDBACK_IMAGE_MIME_TYPES)[number];

function isAcceptedMimeType(type: string): type is AcceptedMimeType {
  return (ACCEPTED_FEEDBACK_IMAGE_MIME_TYPES as readonly string[]).includes(type);
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
 * 事件共用同一套校验逻辑——跟 post-image-picker.tsx 的
 * validateIncomingFiles 是同构写法，没有导入复用（见文件顶部说明）。
 */
function validateIncomingFiles(
  candidateFiles: File[],
  existingFiles: File[]
): ValidateFilesResult {
  const errors: string[] = [];
  const validated: File[] = [];

  for (const file of candidateFiles) {
    if (!isAcceptedMimeType(file.type)) {
      if (HEIC_MIME_TYPES.includes(file.type)) {
        errors.push(
          `${file.name}：iPhone 拍摄的 HEIC 格式暂不支持，请在系统设置里把拍照格式改成"兼容性最好"（设置 → 相机 → 格式），或从相册选择时选择 JPEG 格式后再试。`
        );
      } else {
        errors.push(`${file.name}：只支持 JPEG、PNG 或 WEBP 格式的图片。`);
      }
      continue;
    }
    if (file.size === 0) {
      errors.push(`${file.name}：文件是空的，无法上传。`);
      continue;
    }
    if (file.size > MAX_FEEDBACK_IMAGE_SIZE_BYTES) {
      errors.push(`${file.name}：文件大小不能超过 ${MAX_FEEDBACK_IMAGE_SIZE_MB}MB。`);
      continue;
    }
    if (isDuplicateOf(file, existingFiles) || isDuplicateOf(file, validated)) {
      errors.push(`${file.name}：和已选择的图片重复。`);
      continue;
    }
    validated.push(file);
  }

  const remainingSlots = Math.max(0, MAX_FEEDBACK_IMAGES - existingFiles.length);
  let accepted = validated;
  if (validated.length > remainingSlots) {
    const overflowCount = validated.length - remainingSlots;
    accepted = validated.slice(0, remainingSlots);
    errors.push(
      `最多只能上传 ${MAX_FEEDBACK_IMAGES} 张截图，超出的 ${overflowCount} 张已被忽略。`
    );
  }

  return { accepted, errors };
}

export interface FeedbackImagePickerProps {
  value: File[];
  onChange: (files: File[]) => void;
  id?: string;
}

export function FeedbackImagePicker({
  value,
  onChange,
  id = "feedback-image-picker"
}: FeedbackImagePickerProps) {
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
      <label htmlFor={inputId} className="mb-2 block cursor-pointer text-sm font-medium text-text">
        添加截图（可选，最多 {MAX_FEEDBACK_IMAGES} 张，支持 JPEG/PNG/WEBP，单张不超过 {MAX_FEEDBACK_IMAGE_SIZE_MB}MB）
        <div
          data-testid="feedback-image-drop-zone"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="mt-2 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-border bg-bg px-4 py-8 text-center font-normal"
        >
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_FEEDBACK_IMAGE_MIME_TYPES.join(",")}
            multiple
            onChange={handleInputChange}
            className="sr-only"
          />
          <p className="text-sm text-text-muted">拖拽截图到此处，或点击从相册选择</p>
        </div>
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
        <ul className="mt-3 grid grid-cols-3 gap-2">
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

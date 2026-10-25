import { Camera, X } from "lucide-react";
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
 * 发布页简化改版（任务卡 7）：去掉了原来单独的"拍照"按钮和它的第二个
 * <input capture="environment">，只保留"从相册选择/拖拽上传"这一个入口。
 * iOS WKWebView 里 <input type="file"> 的系统选择器通常自带"拍照/从图库
 * 选择"选项，大概率不会真的损失拍照能力，但这一点需要在真机上实际确认。
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

  // 发布页改版（2026-10-25）：已选的图片和"添加照片 n/9"方块排在同一行（手机
  // 上没有"拖拽"这回事，原来"拖拽图片到此处"的大虚线框改成一个小方块）。
  // 电脑上照样可以把图片拖到方块上。
  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {value.map((file, index) => (
          <li key={`${file.name}-${file.size}-${index}`} className="relative h-[84px] w-[84px]">
            {previewUrls[index] ? (
              <img
                src={previewUrls[index]}
                alt={file.name}
                width={84}
                height={84}
                className="h-full w-full rounded-xl object-cover"
              />
            ) : (
              <span className="block h-full w-full rounded-xl bg-surface-muted" />
            )}
            <span className="sr-only">{file.name}</span>
            <button
              type="button"
              aria-label="删除"
              onClick={() => handleRemove(index)}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
        {/* 满 9 张时方块还在（显示 9/9），再选会提示"最多只能上传 9 张"，
            不会悄悄丢掉用户选的图。 */}
        {(
          <li>
            {/* 输入框用 aria-label 保留"上传图片"这个可访问名称。 */}
            <label htmlFor={inputId} className="block cursor-pointer">
              <div
                data-testid="post-image-drop-zone"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="flex h-[84px] w-[84px] flex-col items-center justify-center gap-0.5 rounded-xl border-[1.5px] border-dashed border-border text-text-muted"
              >
                <input
                  id={inputId}
                  type="file"
                  accept={ACCEPTED_POST_IMAGE_MIME_TYPES.join(",")}
                  multiple
                  aria-label="上传图片"
                  onChange={handleInputChange}
                  className="sr-only"
                />
                <Camera size={24} aria-hidden="true" />
                <span className="text-xs">添加照片</span>
                <span className="text-[11px]">
                  {value.length}/{MAX_POST_IMAGES}
                </span>
              </div>
            </label>
          </li>
        )}
      </ul>
      {errors.length > 0 ? (
        <div role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors.map((message) => (
            <p key={message} className="leading-relaxed">
              {message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

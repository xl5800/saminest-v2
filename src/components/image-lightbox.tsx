import { useEffect, useState } from "react";

export interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

const iconButtonClassName =
  "flex h-11 w-11 items-center justify-center rounded-full text-2xl text-white";

/**
 * 帖子详情页图片全屏查看器。这个仓库目前没有专门的 Dialog/Modal 组件，
 * 沿用 my-posts-page.tsx 删除确认弹窗那个"fixed inset-0 + 本地 state"的
 * 模式，不新引入一个通用弹层组件——目前只有这一个用到全屏浮层的场景，
 * 等真的出现第二个使用场景再考虑抽共享组件。z-20 跟那个弹窗一致，盖过
 * AppHeader/BottomNav 的 z-10 就够。
 *
 * 关闭三种方式（× 按钮 / 点击背景 / Esc）都会调用 onClose；点击图片本身、
 * 点击切换按钮都 stopPropagation，避免冒泡到浮层容器自己的 onClick 被
 * 当成"点了背景"（切换按钮如果不 stopPropagation，点"下一张"会在切换的
 * 同一次点击里连带把浮层关掉）。
 *
 * 不做的事（明确不在这次范围内）：不支持双指缩放/拖拽平移，不支持手指
 * 滑动切换——这次先用按钮，以后需要再加。
 */
export function ImageLightbox({ images, initialIndex, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const hasMultipleImages = images.length > 1;

  function showPrevious(): void {
    setCurrentIndex((current) => (current - 1 + images.length) % images.length);
  }

  function showNext(): void {
    setCurrentIndex((current) => (current + 1) % images.length);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      } else if (hasMultipleImages && event.key === "ArrowLeft") {
        showPrevious();
      } else if (hasMultipleImages && event.key === "ArrowRight") {
        showNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasMultipleImages, onClose]);

  // 锁住页面滚动：读一下打开前 body 已有的 overflow 值存起来，关闭/卸载
  // 时还原成那个值，而不是硬编码还原成空字符串——避免跟页面自身可能设置
  // 的其它 overflow 样式打架。
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="查看大图"
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="关闭"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={`${iconButtonClassName} absolute right-4 top-4`}
      >
        ×
      </button>

      <img
        src={images[currentIndex]}
        alt="帖子图片"
        className="max-h-full max-w-full object-contain"
        onClick={(event) => event.stopPropagation()}
      />

      {hasMultipleImages ? (
        <>
          <button
            type="button"
            aria-label="上一张"
            onClick={(event) => {
              event.stopPropagation();
              showPrevious();
            }}
            className={`${iconButtonClassName} absolute left-2 top-1/2 -translate-y-1/2`}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={(event) => {
              event.stopPropagation();
              showNext();
            }}
            className={`${iconButtonClassName} absolute right-2 top-1/2 -translate-y-1/2`}
          >
            ›
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white">
            {currentIndex + 1} / {images.length}
          </p>
        </>
      ) : null}
    </div>
  );
}

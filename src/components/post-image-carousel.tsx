import { type MouseEvent, type PointerEvent, useRef, useState } from "react";

export interface PostImageCarouselProps {
  images: string[];
  /** 点击（不是滑动）某一张图时触发，参数是被点击那张图自己的下标。不传时图片
   *  不是按钮——比如 Feed 卡片外层本来就是一个 <Link>，点击直接冒泡给 Link 跳
   *  详情页，不需要这里再重复跳一次。 */
  onImageClick?: (index: number) => void;
  /** CSS aspect-ratio 值，Feed 用 "4 / 3"，详情页可以更高。 */
  aspectRatio?: string;
}

/** 手指/鼠标从按下到抬起的横向位移超过这个值，或者滚动位置变化超过
 *  SCROLL_CLICK_TOLERANCE_PX，这次"点击"就当作滑动的收尾，不触发任何点击。 */
const POINTER_CLICK_TOLERANCE_PX = 10;
const SCROLL_CLICK_TOLERANCE_PX = 5;

/**
 * 帖子图片区域：一次只显示一张，多张时左右滑动切换，底部小圆点指示当前张数。
 * Feed 列表卡片和社区帖子详情页共用。
 *
 * 滑动完全靠原生 CSS scroll-snap（横向 overflow-x-auto + snap-x
 * snap-mandatory，每张图 snap-center / w-full / shrink-0），触摸手势由浏览器
 * 处理，不自己写手势判断；项目里也没有装任何轮播库。
 *
 * 圆点：onScroll 里用 Math.round(scrollLeft / clientWidth) 算当前是第几张
 * （clientWidth 为 0，比如还没布局时，退回第 0 张，避免 NaN）。
 *
 * "滑动 vs 点击"：触屏上浏览器识别成滚动手势后本来就不会再派发 click，但
 * 鼠标拖拽、触控板这类场景可能在位移之后仍然派发 click。所以在容器上用
 * onClickCapture 兜底：pointerdown 时记下起点坐标和 scrollLeft，click 到来时
 * 如果横向位移或滚动位置变化超过阈值，就 preventDefault + stopPropagation
 * 吞掉这次 click——capture 阶段先于子元素按钮的 onClick 和外层 <Link> 的
 * 导航，所以"纯滑动不触发点击"对两种用法（传 onImageClick / 嵌在 Link 里）
 * 都成立；静止点击则原样放行。
 *
 * images 为空时渲染 null、不占位；只有一张时直接渲染这一张，没有滚动容器和
 * 圆点。
 */
export function PostImageCarousel({
  images,
  onImageClick,
  aspectRatio = "4 / 3"
}: PostImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const pointerStartRef = useRef<{ x: number; scrollLeft: number } | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  if (images.length === 0) return null;

  function renderImage(imageUrl: string, index: number) {
    const image = (
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        draggable={false}
        className="h-full w-full object-cover"
      />
    );
    if (!onImageClick) return image;
    return (
      <button
        type="button"
        aria-label={`查看大图 ${index + 1}`}
        onClick={() => onImageClick(index)}
        className="block h-full w-full"
      >
        {image}
      </button>
    );
  }

  if (images.length === 1) {
    return (
      <div className="overflow-hidden rounded-lg bg-bg" style={{ aspectRatio }}>
        {renderImage(images[0], 0)}
      </div>
    );
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    pointerStartRef.current = {
      x: event.clientX,
      scrollLeft: event.currentTarget.scrollLeft
    };
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>): void {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;
    const moved =
      Math.abs(event.clientX - start.x) > POINTER_CLICK_TOLERANCE_PX ||
      Math.abs(event.currentTarget.scrollLeft - start.scrollLeft) > SCROLL_CLICK_TOLERANCE_PX;
    if (moved) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleScroll(): void {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;
    const index = Math.round(scroller.scrollLeft / scroller.clientWidth);
    setActiveIndex(Math.min(Math.max(index, 0), images.length - 1));
  }

  return (
    <div className="relative overflow-hidden rounded-lg bg-bg">
      <div
        ref={scrollerRef}
        data-testid="post-image-carousel-scroller"
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onClickCapture={handleClickCapture}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ aspectRatio }}
      >
        {images.map((imageUrl, index) => (
          <div key={`${imageUrl}-${index}`} className="h-full w-full shrink-0 snap-center">
            {renderImage(imageUrl, index)}
          </div>
        ))}
      </div>
      <div
        role="img"
        aria-label={`第 ${activeIndex + 1} 张，共 ${images.length} 张`}
        className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center"
      >
        {/* 半透明深色底，白点在亮色图片上也看得清。 */}
        <div className="flex gap-1.5 rounded-full bg-black/30 px-2 py-1">
          {images.map((_, index) => (
            <span
              key={index}
              data-active={index === activeIndex ? "true" : "false"}
              className={`h-1.5 w-1.5 rounded-full ${
                index === activeIndex ? "bg-white" : "bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

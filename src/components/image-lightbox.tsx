import { X } from "lucide-react";
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
 * 真实 bug 修复 + 关闭按钮位置调整任务卡：× 按钮之前"点了没反应"的根因不是
 * 这次最初怀疑的 z-index/AppHeader 遮挡——post-detail-page.tsx 这个页面
 * 本身根本不渲染 AppHeader（NO_CHROME_PATTERNS，见该文件顶部注释），z-20
 * 也确实盖过了页面自己 fixed 的返回按钮，桌面/无刘海环境下这个按钮点击
 * 完全正常（已用真实 DOM 验证：elementFromPoint 在按钮坐标上返回的就是
 * 按钮本身，点击也确实触发了 onClose）。真正的根因是安全区适配缺失：
 * index.html 全局带了 viewport-fit=cover，index.css 给 body 加了
 * `padding-top: env(safe-area-inset-top)` 把正常文档流内容整体下移，但
 * `position: fixed` 的元素不会继承祖先的 padding，必须每个 fixed 元素自己
 * 单独加 env() 补偿——这个仓库其它 fixed 浮层都这么做了（同一个页面里页面
 * 自己的返回按钮用的是
 * `style={{ top: "calc(1rem + env(safe-area-inset-top))" }}`，底部工具栏
 * 同样有 `paddingBottom: calc(0.75rem + env(safe-area-inset-bottom))`），
 * 唯独这个组件的 ×/‹/› 几个按钮当初漏了这一步，还在用裸的 top-4/right-4。
 * 后果是：post-detail-page.tsx 这一个页面在原生壳里对"有图片的帖子"专门
 * 把状态栏切到 overlaysWebView:true（见该文件 hasImmersiveHeader 那个
 * useEffect），画面延伸到刘海/状态栏底下，safe-area-inset-top 在这个页面
 * 上因此是个显著的非零值（不像大多数其它页面那样接近 0）——× 按钮原来
 * 那个未做安全区补偿的 top-4 定位，恰好落在刘海/状态栏这块系统保留区域
 * 里，真机上这片区域的点击经常被系统吞掉、传不到 WebView，这才是"看得见、
 * 点不动"的真正原因，不是层级问题。
 *
 * 这次顺带做的设计调整（关闭按钮从页面右上角固定栏，改成叠在图片本身
 * 左上角的浮层）恰好也从另一个角度缓解了这个问题——按钮现在跟图片的
 * 实际渲染框绑在一起（img 和按钮共享同一个 relative 容器），大多数照片
 * 都不是刚好铺满整个竖直方向（有黑边留白），按钮自然离视口最顶端有一段
 * 距离；但这只是巧合缓解，不是根本修复——遇到刚好铺满全屏高度的竖版大图
 * 时按钮仍然可能贴着容器顶边，所以下面仍然显式给最外层浮层容器加了
 * `paddingTop: env(safe-area-inset-top)`（连同对称的
 * paddingBottom，图片和按钮因此永远不会渲染到安全区之外），这才是真正
 * 堵住这个坑的部分，不能只靠换位置侥幸绕过去。
 *
 * img 的定位方式也跟着从"直接作为 flex 子元素，靠 max-h-full/max-w-full
 * 相对 flex 容器解析百分比"改成"包一层 relative 的 wrapper 承接按钮的
 * absolute 定位，img 自己改用
 * max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))]
 * /max-w-[100vw] 这种相对视口的绝对单位、不再依赖父级百分比"——如果 img
 * 还是靠相对父元素的百分比 max-height 撑开，父级 wrapper 的高度又反过来
 * 要靠 img 撑开决定，会形成循环依赖，浏览器只能按"百分比失效"处理，图片
 * 会失去"不超出屏幕"的约束；改用视口绝对单位就没有这个循环问题。高度这里
 * 没有直接用 100dvh，是因为最外层浮层容器这次加了
 * paddingTop/paddingBottom（上面这条注释说的安全区补偿），img 实际可用的
 * 高度是"视口高度减去这两段安全区"，不再是整个 100dvh——用 calc()
 * 显式减掉这两个 env() 值，而不是简单的 max-h-full 相对 flex 容器解析
 * 百分比（那样会绕回前面提到的百分比循环依赖问题）。
 *
 * 不做的事（明确不在这次范围内）：不支持双指缩放/拖拽平移，不支持手指
 * 滑动切换——这次先用按钮，以后需要再加；‹/› 切换按钮和底部"N / M"计数
 * 保持原来挂在最外层浮层（不是图片）上的位置，这次任务卡只要求调整
 * 关闭按钮，没有要求这两个也跟着挪。
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
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)"
      }}
      onClick={onClose}
    >
      <div className="relative" onClick={(event) => event.stopPropagation()}>
        <img
          src={images[currentIndex]}
          alt="帖子图片"
          className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-[100vw] object-contain"
        />

        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="absolute left-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

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

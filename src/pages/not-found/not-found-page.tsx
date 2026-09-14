import { Link } from "react-router-dom";

import { TopBar } from "../../components/top-bar";

/**
 * 通配路由兜底页（*）。26 号卡（18 条旧 AppHeader 路由统一迁移到
 * TopBar）：改用 TopBar 的 nav-only 变体（带 title="页面未找到"），原来
 * 手写的 <h1> 删掉，避免页面里同时出现两个 <h1>。返回箭头用 TopBar 默认的
 * navigate(-1)，不额外实现特殊的返回逻辑；下面这行"返回首页"链接是导航到
 * 固定的 / 路径（跟"返回上一页"语义不同，两者都保留）。
 */
export function NotFoundPage() {
  return (
    <main>
      <TopBar variant="nav-only" title="页面未找到" />
      {/* 全 App 视觉 Token 体系（第二批）：这段文字之前完全没有颜色/字号
          class，直接继承默认黑字——BARRY 方案里这类空状态描述文字应该用
          --color-text-muted，跟站内其它"暂无 XX"空状态文案（比如
          favorites-page.tsx"暂无收藏"）用的是同一套 text-sm text-text-muted
          约定，这次补上让它跟其它空状态视觉一致。BARRY 方案完整的空状态
          还包含图标圆圈/按钮，但那需要新增 DOM 结构，这次任务卡明确要求
          不碰组件结构，所以只做了颜色/字号这一层，没有加图标或按钮。 */}
      <p className="px-4 py-6 text-sm text-text-muted">
        没有找到这个页面，
        <Link to="/" className="text-primary hover:underline">
          返回首页
        </Link>
        。
      </p>
    </main>
  );
}

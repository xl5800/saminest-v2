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
      <p>
        没有找到这个页面，<Link to="/">返回首页</Link>。
      </p>
    </main>
  );
}

import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main>
      <h1>页面未找到</h1>
      <p>
        没有找到这个页面，<Link to="/">返回首页</Link>。
      </p>
    </main>
  );
}

import { useParams } from "react-router-dom";

/**
 * 占位详情页：路由和最基础的展示先接上，完整功能（真实数据、图片、
 * 联系方式、收藏等）是下一步任务，这里不做。
 */
export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main>
      <h1>帖子详情</h1>
      <p>帖子 ID：{id}</p>
      <p role="status">详情页正在建设中，敬请期待。</p>
    </main>
  );
}

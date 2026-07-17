import { useLocation, useParams } from "react-router-dom";

import { FavoriteButton } from "../../components/favorite-button";

const DEFAULT_STATUS_MESSAGE = "详情页正在建设中，敬请期待。";

interface PostDetailLocationState {
  publishSuccessMessage?: string;
}

/**
 * 占位详情页：路由和最基础的展示先接上，完整功能（真实数据、图片、
 * 联系方式、收藏等）是下一步任务，这里不做。
 *
 * 发布表单提交成功后会带着 location.state.publishSuccessMessage 跳转到这里，
 * 用来展示"发布成功，等待审核"提示；没有这个 state 时退回原来的占位文案。
 */
export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const state = location.state as PostDetailLocationState | null;
  const statusMessage = state?.publishSuccessMessage ?? DEFAULT_STATUS_MESSAGE;

  return (
    <main>
      <h1>帖子详情</h1>
      <p>帖子 ID：{id}</p>
      <p role="status">{statusMessage}</p>
      {id ? <FavoriteButton postId={id} /> : null}
    </main>
  );
}

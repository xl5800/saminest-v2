import { Link, useLocation, useParams } from "react-router-dom";

import { ContactSellerButton } from "../../components/contact-seller-button";
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
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">帖子详情</h1>
      <p className="mb-2 text-sm text-text-muted">帖子 ID：{id}</p>
      <p role="status" className="mb-4 text-sm text-text-muted">
        {statusMessage}
      </p>
      <div className="flex items-center gap-4">
        {id ? <FavoriteButton postId={id} /> : null}
        {id ? <ContactSellerButton postId={id} /> : null}
        {id ? (
          <Link
            to={`/post/${id}/report`}
            className="text-sm text-text-muted hover:text-danger hover:underline"
          >
            举报
          </Link>
        ) : null}
      </div>
    </main>
  );
}

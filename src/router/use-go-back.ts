import { useNavigate } from "react-router-dom";

/**
 * "返回上一页"，没有上一页时回到兜底页面。
 *
 * 为什么需要：原来所有返回按钮都是 navigate(-1)。用户从微信群点分享卡片
 * 直接打开活动/帖子详情页时，这个页面是浏览历史里的第一条，navigate(-1)
 * 什么都不会发生（或者直接退出网页），详情页底部又被报名/私信操作栏盖住
 * 了底部导航，用户就被困在这一页，看不到其它活动。
 *
 * createBrowserRouter 会在 window.history.state 里记一个 idx（这个标签页
 * 里第几条站内历史）：idx 为 0 说明是直接打开的第一页，没有站内的上一页，
 * 这时改成跳到 fallback（replace，不在历史里多留一条）。
 */
export function hasInAppHistory(): boolean {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === "number" && state.idx > 0;
}

export function useGoBack(fallback = "/"): () => void {
  const navigate = useNavigate();
  return () => {
    if (hasInAppHistory()) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  };
}

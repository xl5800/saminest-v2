import { Link } from "react-router-dom";

import {
  useActivityParticipationAction,
  type UseActivityParticipationActionInput
} from "../features/activities/use-activity-participation-action";

export const SECONDARY_BUTTON_CLASS_NAME =
  "w-full rounded-xl border border-border px-4 py-2 font-semibold text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60";
export const PRIMARY_BUTTON_CLASS_NAME =
  "w-full rounded-xl bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60";

export type ActivityParticipationButtonProps = UseActivityParticipationActionInput;

export type ActivityParticipationAction = ReturnType<typeof useActivityParticipationAction>;

/**
 * useActivityParticipationAction 返回值的纯渲染部分——不调用任何 hook，
 * 只负责把状态渲染成 UI。抽出来的原因：活动详情页（ActivityDetailPage）
 * 头像堆叠的"空位"点击必须跟"参加活动"按钮共享完全同一份状态/mutation
 * 实例（任务卡的硬性要求），如果详情页直接渲染 <ActivityParticipationButton
 * activityId=.../>，这个组件会在内部再调一次
 * useActivityParticipationAction，产生第二个独立的 hook 实例（各自的
 * pending/disabled 状态互不相通）——两处入口就会分裂成两套判断，正是
 * 任务卡明确要避免的问题。
 *
 * 所以详情页改成：自己调用一次 useActivityParticipationAction，把同一个
 * `action` 对象分别传给这个纯渲染组件（渲染按钮本身）和
 * ActivityParticipantAvatars 的 onTapEmptySlot/canTapEmptySlot（驱动空位
 * 点击）——两处画面背后是同一个 React state、同一个 mutation 对象，点
 * 按钮和点空位在数据层面是同一个操作，不可能出现"一个觉得能点、另一个
 * 觉得已经在处理"的不一致。ActivityParticipationButton（下面）作为独立
 * 组件继续存在，供其它可能只需要单独一个按钮、不需要头像堆叠联动的场景
 * 使用，内部也只是调一次 hook 再交给这个纯渲染组件，跟详情页是同一套
 * 渲染逻辑，不是重复实现。
 */
export function ActivityParticipationButtonView({ action }: { action: ActivityParticipationAction }) {
  if (action.loggedOut) {
    return (
      <p className="text-sm text-text-muted">
        <Link to="/login" className="text-primary hover:underline">
          登录
        </Link>
        后可以报名
      </p>
    );
  }

  const errorBanner = action.error ? (
    <p role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
      {action.error}
    </p>
  ) : null;

  if (action.isRejected) {
    return (
      <div>
        <p className="w-full rounded-xl border border-border px-4 py-2 text-center text-sm text-text-muted">
          申请已被拒绝
        </p>
        {errorBanner}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={action.disabled}
        onClick={action.handleClick}
        className={action.isApproved ? SECONDARY_BUTTON_CLASS_NAME : PRIMARY_BUTTON_CLASS_NAME}
      >
        {action.label}
      </button>
      {errorBanner}
    </div>
  );
}

/**
 * 报名/申请加入/退出按钮：跟 FavoriteButton 是同一套"未登录引导登录、
 * 已登录直接操作"的模式，但未登录时不是"点击后跳 /login"，而是直接展示
 * 一行"登录后可以报名"的文字 + 登录链接——这个按钮独占详情页一整行的
 * 空间，不像 FavoriteButton 嵌在紧凑的列表卡片里，直接展示一个更明确的
 * 引导链接比藏在点击行为背后更直接，跟 comment-section.tsx 顶部评论框
 * 未登录态的处理是同一个思路。
 *
 * P2 报名审核制上线后，报名状态从布尔"是否已报名"扩成四态
 * （getActivityParticipationStatus 的返回值），按钮要表达五种界面状态
 * （未参与不需审核/未参与需审核/pending/approved/rejected），具体每种
 * 状态对应的文案和可点性见 useActivityParticipationAction 的注释。
 *
 * 头像堆叠改版：这个组件的状态机 + 提交逻辑已经整体搬到
 * useActivityParticipationAction 这个 hook 里，渲染逻辑搬到上面的
 * ActivityParticipationButtonView——这里现在只是"调一次 hook，把结果交给
 * 纯渲染组件"，对外的 props/行为跟改造前完全一样，纯内部重构。活动详情页
 * 不使用这个组件本身（见 ActivityParticipationButtonView 的注释），而是
 * 自己调用同一个 hook、复用同一个 View，为的是让头像堆叠的空位点击和这个
 * 按钮共享同一个 hook 实例。
 */
export function ActivityParticipationButton(props: ActivityParticipationButtonProps) {
  const action = useActivityParticipationAction(props);
  return <ActivityParticipationButtonView action={action} />;
}

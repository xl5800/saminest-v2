import type { ReactNode } from "react";

export interface ProfileSummaryProps {
  displayName: string | null;
  avatarUrl: string | null;
  locationName?: string | null;
  bio?: string | null;
  /** compact 变体卡片里的第三行文字（目前只有"我的"页传邮箱）。default
   *  变体不使用这个字段——公开主页从来不展示邮箱，这是隐私信息，见
   *  profile-page.tsx 顶部注释。组件本身不认识"邮箱"这个具体概念，只负责
   *  在 compact 卡片里摆这么一行文字，调用方决定内容是什么。 */
  tertiaryText?: string | null;
  /**
   * default（96px 居中头像 + 姓名/城市/简介，公开主页 user-profile-page.tsx
   * 用）｜ compact（56px 左对齐横排卡片，"我的"页 profile-page.tsx 用）。
   *
   * 06 号卡确认的方案：这两种布局分别对应两张不同的历史任务卡——公开主页
   * 96px 居中是 36732ee（个人主页视觉统一）定的；"我的"页 56px 横排卡片
   * 是更早的 codex_task_profile_redesign.md 定的，06 号卡要求"我的"页
   * 恢复这个更早的验收标准。两边都要保留、不能二选一（36732ee 把两个页面
   * 统一成同一个组件是为了让用户自己也能看到"我在别人眼里主页长什么样"，
   * 这个目的不因为"我的"页换回小尺寸卡片而失效——用户依然能在同一个组件
   * 里看到跟公开主页同源的姓名/头像数据，只是"我的"页的摆放形态不同），
   * 所以做成同一个组件的两个 size 变体，而不是让"我的"页拆出去自己另写
   * 一份头像卡片 JSX（那样两个页面又会变回改版前"各写各的"的状态）。
   *
   * compact 变体不展示 locationName——严格对照
   * codex_task_profile_redesign.md 的验收标准（头像卡片只有昵称/个性签名/
   * 邮箱三行，没有城市），这条早于"资料页 bio/城市"这个字段存在，06 号卡
   * 只要求复用它的验收标准，没有要求额外补上城市行，所以不在这里顺带加。
   */
  size?: "default" | "compact";
  children?: ReactNode;
}

/**
 * 头像 + 姓名 + 城市/简介（或邮箱）的展示区块，供"我的"页
 * （profile-page.tsx，compact 变体）和公开个人主页（user-profile-page.tsx，
 * default 变体）共用——见上面 size 这个 prop 的注释，两种布局分别对应两张
 * 不同的历史任务卡，都要保留。
 *
 * displayName 为 null（理论上不应该发生，profiles.display_name 是
 * not null 列，这里的 null 只是防御性地兼容"数据还在加载中"这种调用方
 * 传 undefined/null 过来的中间状态）时退回"?"占位首字母，不是留空。
 */
export function ProfileSummary({
  displayName,
  avatarUrl,
  locationName,
  bio,
  tertiaryText,
  size = "default",
  children
}: ProfileSummaryProps) {
  const avatarInitial = displayName?.trim().charAt(0).toUpperCase() || "?";

  if (size === "compact") {
    return (
      <div className="flex items-center rounded-profile-card bg-card p-3.5">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-bg text-xl font-semibold text-text-muted"
          >
            {avatarInitial}
          </div>
        )}

        <div className="ml-3.5 min-w-0 flex-1">
          {/* 不用 <h1>——compact 变体只在"我的"页用，那个页面的 <h1> 已经是
              TopBar tab 变体渲染的标题"我的"，这里再来一个 <h1> 就是
              top-bar.tsx 顶部注释明确警告过的"同一个页面出现两个 <h1>"。
              default 变体（下面）保留 <h1>，因为公开主页的 TopBar 是
              detail 变体且不传 title，不会跟这里冲突，displayName 依然是
              那个页面唯一的 <h1>。 */}
          <p className="truncate text-base font-semibold text-text">
            {displayName ?? "未知用户"}
          </p>

          {bio ? (
            <p className="mt-0.5 truncate text-[12.5px] text-text-muted">{bio}</p>
          ) : null}

          {tertiaryText ? (
            <p className="mt-0.5 truncate text-[11.5px] text-text-subtle">{tertiaryText}</p>
          ) : null}

          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-24 w-24 items-center justify-center rounded-full bg-bg text-3xl font-semibold text-text-muted"
        >
          {avatarInitial}
        </div>
      )}

      <h1 className="mt-3 break-words text-xl font-bold text-text">
        {displayName ?? "未知用户"}
      </h1>

      {locationName ? <p className="mt-1 text-sm text-text-muted">{locationName}</p> : null}

      {bio ? (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-text">{bio}</p>
      ) : null}

      {children}
    </div>
  );
}

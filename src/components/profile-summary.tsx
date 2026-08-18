import type { ReactNode } from "react";

export interface ProfileSummaryProps {
  displayName: string | null;
  avatarUrl: string | null;
  locationName?: string | null;
  bio?: string | null;
  /** 头像/展示区下面的操作区，两个页面各自传不同内容——公开主页
   *  （user-profile-page.tsx）传"发消息"按钮（含它自己的 loading/error
   *  状态），"我的"页（profile-page.tsx）传"编辑资料"按钮 + 邮箱文字。这个
   *  组件不关心 children 具体是什么，只负责把它摆在头像/姓名/城市/简介
   *  下面同一个居中列里。 */
  children?: ReactNode;
}

/**
 * 头像（96px，img 或首字母占位）+ 姓名 + 城市（非空才显示）+ 简介（非空
 * 才显示）的展示区块，从 user-profile-page.tsx 原样抽出来，供公开个人
 * 主页和"我的"页共用——两个页面之前是完全不同的两套视觉语言（公开主页
 * 96px 大头像居中展示，"我的"页是一个 56px 头像的小横条卡片），用户自己
 * 看不到"我在别人眼里主页长什么样"，也看不到自己填的城市/简介有没有生效。
 * 抽成这个共享组件之后两个页面头部视觉统一，"我的"页也会展示城市/简介，
 * 不需要为它重新查一份数据——`useMyProfileQuery()` 早就带出了这两个字段。
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
  children
}: ProfileSummaryProps) {
  const avatarInitial = displayName?.trim().charAt(0).toUpperCase() || "?";

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

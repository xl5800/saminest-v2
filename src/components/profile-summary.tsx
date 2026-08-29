import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface ProfileSummaryProps {
  displayName: string | null;
  avatarUrl: string | null;
  bio?: string | null;
  /** 卡片里的第三行文字（目前只有"我的"页传邮箱）。组件本身不认识"邮箱"
   *  这个具体概念，只负责摆这么一行文字，调用方决定内容是什么。 */
  tertiaryText?: string | null;
  /** 11 号卡新增：提供了这个值时，头像（不是整张卡片，只有头像本身）会
   *  包一层 `<Link>` 跳过去——"我的"页用这个跳转到自己的公开主页
   *  `/users/:selfId`，预览"别人眼中的我的主页"长什么样。组件不关心跳去
   *  哪、也不关心调用方是不是自己的主页，只负责"传了就包 Link，没传就是
   *  纯展示"，跟 tertiaryText 是同一个"中立摆放，不内置业务含义"的原则。 */
  avatarHref?: string;
  children?: ReactNode;
}

/**
 * 头像 + 姓名 + 简介（或邮箱）的横排卡片，"我的"页 profile-page.tsx 专用
 * （56px 头像、左对齐横排，见 06 号卡对 codex_task_profile_redesign.md
 * 验收标准的复用）。
 *
 * 22 号卡（用户主页改版）之前，这个组件还有一个 "default" 变体（96px
 * 居中头像 + 姓名/城市/简介）供公开个人主页 user-profile-page.tsx 用；
 * 22 号卡把那个页面换成了通栏大方块头图（不再是圆形居中头像），不再需要
 * 这个变体，连同它专属的 locationName 展示、size 判别式一起删掉了，不留
 * 死代码——"我的"页这里用的横排卡片布局本身完全没变。
 *
 * displayName 为 null（理论上不应该发生，profiles.display_name 是
 * not null 列，这里的 null 只是防御性地兼容"数据还在加载中"这种调用方
 * 传 undefined/null 过来的中间状态）时退回"?"占位首字母，不是留空。
 *
 * 不渲染 <h1>——"我的"页那个 <h1> 已经是 TopBar tab 变体渲染的标题"我的"，
 * 这里再来一个 <h1> 就是 top-bar.tsx 顶部注释明确警告过的"同一个页面出现
 * 两个 <h1>"。
 */
export function ProfileSummary({
  displayName,
  avatarUrl,
  bio,
  tertiaryText,
  avatarHref,
  children
}: ProfileSummaryProps) {
  const avatarInitial = displayName?.trim().charAt(0).toUpperCase() || "?";

  const avatarContent = avatarUrl ? (
    <img src={avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
  ) : (
    <div
      aria-hidden="true"
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-bg text-xl font-semibold text-text-muted"
    >
      {avatarInitial}
    </div>
  );
  const avatar = avatarHref ? (
    <Link to={avatarHref} aria-label="预览我的主页" className="shrink-0 rounded-full">
      {avatarContent}
    </Link>
  ) : (
    avatarContent
  );

  return (
    <div className="flex items-center rounded-profile-card bg-card p-3.5">
      {avatar}

      <div className="ml-3.5 min-w-0 flex-1">
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

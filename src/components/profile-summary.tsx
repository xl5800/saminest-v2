import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { formatLocationDisplayName } from "../data/us-states";

export interface ProfileSummaryProps {
  displayName: string | null;
  avatarUrl: string | null;
  locationName?: string | null;
  /** default 变体（公开主页）展示的个性签名。24 号卡起 compact 变体
   *  （"我的"页）不再展示简介——见下面 size 的注释——这个字段传给
   *  compact 分支不会有任何效果，不是遗漏。 */
  bio?: string | null;
  /**
   * 11 号卡新增：提供了这个值时，头像（不是整张卡片，只有头像本身）会
   * 包一层 `<Link>` 跳过去——"我的"页用这个跳转到自己的公开主页
   * `/users/:selfId`，预览"别人眼中的我的主页"长什么样。组件不关心跳去
   * 哪、也不关心调用方是不是自己的主页，只负责"传了就包 Link，没传就是
   * 纯展示"，跟 editHref 是同一个"中立摆放，不内置业务含义"的原则。
   *
   * 目前只有 compact 变体的渲染分支接了这个 prop——11 号卡的需求只在
   * "我的"页（compact），default 变体（公开主页 user-profile-page.tsx）
   * 传这个值目前不会有任何效果，不是遗漏：已经站在别人的主页上了，没有
   * 再跳一次的理由，等哪天 default 变体真的需要这个能力时再补，不在这次
   * 顺带做一个当前没有调用方用得到的分支。 */
  avatarHref?: string;
  /**
   * 24 号卡新增：提供了这个值时，compact 变体卡片右上角会渲染一个小的
   * 圆形铅笔图标按钮，跳到这个地址（"我的"页传 /profile/edit）——
   * 24.2.2 把原来列表里单独一行的"编辑资料"入口挪到了这里。跟
   * avatarHref 同一个原则：只有 compact 分支接这个 prop，default 变体
   * （公开主页）传了也不会有效果，目前也没有调用方会传。 */
  editHref?: string;
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
   * codex_task_profile_redesign.md 最初的验收标准，06 号卡确认这一点没有
   * 变。24 号卡起 compact 连简介/邮箱这两行也一起去掉了（头像卡片改版：
   * 昵称右边挪出空间给编辑资料图标，下方换成"我的发布/我的收藏"数据条），
   * compact 现在只剩"头像 + 昵称"一行信息 + children 摆的内容（默认是
   * 24 号卡传的数据条），不再是 codex_task_profile_redesign.md 那版"三行
   * 文字卡片"的样子——那份文档是更早期的验收标准，已经被 24 号卡取代。
   */
  size?: "default" | "compact";
  /** default 变体：跟改版前一样，渲染在头像/姓名/城市/简介下方（
   *  user-profile-page.tsx 用来摆"发消息"/"屏蔽此人"按钮）。
   *  compact 变体：24 号卡起渲染在"头像+昵称+编辑图标"这一行下方、贴着
   *  上面不加分割线（profile-page.tsx 用来摆"我的发布/我的收藏"数据条）——
   *  组件不关心 children 具体是什么，两种变体都只是"摆放在各自布局里固定
   *  的一个位置"，不内置业务含义。 */
  children?: ReactNode;
}

/**
 * 头像 + 姓名（＋城市/简介，仅 default 变体）的展示区块，供"我的"页
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
  avatarHref,
  editHref,
  size = "default",
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
  const compactAvatar = avatarHref ? (
    <Link to={avatarHref} aria-label="预览我的主页" className="shrink-0 rounded-full">
      {avatarContent}
    </Link>
  ) : (
    avatarContent
  );

  if (size === "compact") {
    return (
      <div className="rounded-profile-card bg-card p-3.5">
        {/* 24 号卡：原来这一整块是单层 flex 横排（头像+姓名+简介+邮箱都在
            同一行里）。现在头像卡片要在同一行右侧腾出编辑资料图标的位置，
            下方还要接一条不带分割线、贯穿全宽的数据条——所以外层从单层
            flex 改成 flex-col，头像/姓名/编辑图标这一组单独占一个
            flex 行，children（数据条）作为第二行紧跟在后面，中间不加任何
            border/divide，视觉上仍然是同一张卡片。 */}
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center">
            {compactAvatar}

            {/* 不用 <h1>——compact 变体只在"我的"页用，那个页面的 <h1> 已经
                是 sr-only 的"我的"（profile-page.tsx），这里再来一个 <h1>
                就是 top-bar.tsx 顶部注释明确警告过的"同一个页面出现两个
                <h1>"。default 变体（下面）保留 <h1>，因为公开主页不会跟
                这里冲突，displayName 依然是那个页面唯一的 <h1>。 */}
            <p className="ml-3.5 min-w-0 truncate text-base font-semibold text-text">
              {displayName ?? "未知用户"}
            </p>
          </div>

          {editHref ? (
            <Link
              to={editHref}
              aria-label="编辑资料"
              className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted hover:text-text"
            >
              <Pencil size={16} aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {children}
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

      {locationName ? (
        <p className="mt-1 text-sm text-text-muted">{formatLocationDisplayName(locationName)}</p>
      ) : null}

      {bio ? (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-text">{bio}</p>
      ) : null}

      {children}
    </div>
  );
}

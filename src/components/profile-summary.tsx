import { UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface ProfileSummaryProps {
  displayName: string | null;
  avatarUrl: string | null;
  /** 11 号卡新增：提供了这个值时，头像（不是整张卡片，只有头像本身）会
   *  包一层 `<Link>` 跳过去——"我的"页用这个跳转到自己的公开主页
   *  `/users/:selfId`，预览"别人眼中的我的主页"长什么样。组件不关心跳去
   *  哪，只负责"传了就包 Link，没传就是纯展示"，跟 profileHref 是同一个
   *  "中立摆放，不内置业务含义"的原则。 */
  avatarHref?: string;
  /** 公开主页 Facebook 风格头图改版（联动"我的"页）：取代了原来的
   *  editHref——同一个位置的圆形图标按钮，但语义从"编辑资料"改成"查看
   *  个人主页"（图标从铅笔 Pencil 换成 UserRound），跳到调用方传入的地址。
   *  "我的"页传自己的公开主页地址 `/users/:currentUserId`，刻意跟
   *  avatarHref 指向同一个目标——头像本身继续保留可点跳转，这个按钮只是
   *  多一个更显眼、语义更明确的专门入口，两者指向同一个页面是有意保留的
   *  双重入口，不是冲突/重复。原来这个位置承担的"编辑资料"入口，这次挪
   *  进了"我的"页下面的分组卡片列表（profile-page.tsx 新增的一行
   *  GroupRow），不再是这张卡片自己的职责。 */
  profileHref?: string;
  /** 渲染在"头像 + 昵称 + 图标按钮"这一行下面，紧贴着不加分割线——"我的"
   *  页用来摆"我的发布/我的收藏"两个入口，组件本身不关心 children 具体
   *  是什么，只负责摆放在这个固定位置。 */
  children?: ReactNode;
}

/**
 * 头像 + 昵称（＋右上角一个可选的图标按钮）的横排卡片，"我的"页
 * profile-page.tsx 专用（56px 头像、左对齐横排）。
 *
 * 22 号卡（用户主页改版）之前，这个组件还有一个 "default" 变体（96px
 * 居中头像 + 姓名/城市/简介）供公开个人主页 user-profile-page.tsx 用；
 * 22 号卡把那个页面换成了通栏大方块头图（不再是圆形居中头像），不再需要
 * 这个变体，连同它专属的 locationName/bio/tertiaryText 展示、size 判别式
 * 一起删掉了——组件现在只剩这一种布局，不留死代码，也不再需要 if (size
 * === "compact") 这层判断。
 *
 * 24 号卡（"我的"页面改版）：头像卡片这次改了内部结构——昵称右边腾出
 * 空间给一个图标按钮（当时是 editHref，编辑资料铅笔图标），原来展示的
 * 简介/邮箱两行文字整个去掉了（这两行内容此前靠已经删掉的 bio/
 * tertiaryText 两个 prop 传，调用方 profile-page.tsx 也早就不传了），
 * 下方改成不加分割线、紧跟在头像/昵称/图标按钮那一行下面的 children——
 * "我的"页用这个位置摆"我的发布/我的收藏"两个入口。
 *
 * 公开主页 Facebook 风格头图改版（联动"我的"页）：那个位置的图标按钮
 * 从 editHref（编辑资料铅笔）换成了 profileHref（查看个人主页，见该
 * prop 的注释）——"编辑资料"这个入口挪进了 profile-page.tsx 下面的分组
 * 卡片列表，这张卡片右上角这个位置现在专门用来跳"我的公开主页"预览。
 *
 * displayName 为 null（理论上不应该发生，profiles.display_name 是
 * not null 列，这里的 null 只是防御性地兼容"数据还在加载中"这种调用方
 * 传 undefined/null 过来的中间状态）时退回"?"占位首字母，不是留空。
 *
 * 不渲染 <h1>——"我的"页那个 <h1> 已经是 sr-only 的"我的"
 * （profile-page.tsx），这里再来一个 <h1> 就是重复的页面主标题。
 */
export function ProfileSummary({
  displayName,
  avatarUrl,
  avatarHref,
  profileHref,
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
    <div className="rounded-profile-card bg-card p-3.5">
      {/* 头像/姓名/编辑图标这一组单独占一个 flex 行，children（"我的
          发布/我的收藏"入口）作为第二行紧跟在后面，中间不加任何
          border/divide，视觉上仍然是同一张卡片。 */}
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center">
          {avatar}

          {/* 不用 <h1>——这个页面的 <h1> 已经是 sr-only 的"我的"
              （profile-page.tsx），这里再来一个 <h1> 就是重复的页面
              主标题。 */}
          <p className="ml-3.5 min-w-0 truncate text-base font-semibold text-text">
            {displayName ?? "未知用户"}
          </p>
        </div>

        {profileHref ? (
          <Link
            to={profileHref}
            aria-label="查看个人主页"
            className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted hover:text-text"
          >
            <UserRound size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {children}
    </div>
  );
}

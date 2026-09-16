import { ChevronRight, Pencil } from "lucide-react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

export interface ProfileSummaryProps {
  displayName: string | null;
  avatarUrl: string | null;
  /** 公开主页 Facebook 风格头图改版（联动"我的"页）新增：这个位置原来是
   *  一个圆形"查看个人主页"图标按钮，整卡可点任务卡把它去掉了——BARRY
   *  反馈那个图标看起来像"头像加载失败的占位图标"，跟真实头像叠在一起
   *  显得乱。现在 profileHref 驱动的是"整张卡片可点"（点头像、昵称、简介
   *  空白处都跳这个地址），右侧改成一个纯装饰性的 `›` 箭头提示可点，不再
   *  是一个独立的图标按钮。不传就是纯展示（不可点、没有箭头），跟原来
   *  "传了就挂行为，没传就是纯展示"的语义一致。 */
  profileHref?: string;
  /** 加回简介+年龄任务卡新增：渲染在头像/昵称/年龄这一行下面。为空
   *  整段不渲染，不展示"简介未填写"这类占位文案——跟 user-profile-page.tsx
   *  data.bio 的判空渲染是同一个约定。可选 prop，不传等同 null（不渲染）。 */
  bio?: string | null;
  /** 整卡可点任务卡：从"简介下面单独一行纯文字"改成跟昵称同一行的胶囊，
   *  为 null/不传整个胶囊不渲染，判空逻辑不变，只是展示形式和位置变了
   *  （之前是 user-profile-page.tsx 那种纯文字行，现在是小圆角胶囊）。 */
  age?: number | null;
  /** 渲染在整张卡片内容（头像/昵称/年龄/简介）下面，紧贴着不加分割线——
   *  这个 prop 目前没有调用方在传了，保留是因为组件设计上"卡片固定内容
   *  之后还能插入任意内容"这个能力本身依然合理，不强制清理，不影响验收。 */
  children?: ReactNode;
}

/**
 * 头像 + 昵称（＋年龄胶囊）的横排卡片，"我的"页 profile-page.tsx 专用
 * （56px 头像、左对齐横排）。
 *
 * 22 号卡（用户主页改版）之前，这个组件还有一个 "default" 变体（96px
 * 居中头像 + 姓名/城市/简介）供公开个人主页 user-profile-page.tsx 用；
 * 22 号卡把那个页面换成了通栏大方块头图，不再需要这个变体，连同它专属的
 * locationName/bio/tertiaryText 展示、size 判别式一起删掉了——组件现在
 * 只剩这一种布局，不留死代码。
 *
 * 整卡可点 + 铅笔编辑角标任务卡（这次改动）：
 * 1. 原来卡片右上角的圆形"查看个人主页"图标按钮（UserRound 图标）删掉了
 *    ——BARRY 反馈这个按钮容易被误认成"头像加载失败的占位图标"，跟真实
 *    头像叠在一起显得乱。改成整张卡片可点（`profileHref` 提供时），右侧
 *    换成一个纯装饰性的 `›`（ChevronRight）箭头提示"这一整块可点"，不再
 *    是一个独立可交互的图标按钮。
 * 2. `avatarHref`（11 号卡加的、头像本身单独可点的 Link）整个删掉了——
 *    调用方 profile-page.tsx 传的 avatarHref 和 profileHref 本来就是
 *    同一个目标地址，整卡都跳这个地址之后，avatarHref 这个 prop 已经
 *    没有存在的必要；继续保留还会导致"头像自己是个 Link、外层卡片又是
 *    可点击容器"这种可点击区域嵌套可点击区域的问题，不如直接删掉。
 * 3. 头像右下角新增一个铅笔编辑角标（`absolute` 定位叠在头像上，白底+
 *    细边框圆形，里面 Pencil 图标），点击跳 `/profile/edit`——这是一个
 *    独立于整卡点击的目标（整卡跳公开主页预览，铅笔跳编辑资料页），所以
 *    最外层容器不能简单包一层 `<Link to={profileHref}>`（那样铅笔这个
 *    `<Link>` 会嵌套在外层 `<Link>` 内部，`<a>` 标签本身不允许嵌套，
 *    点铅笔也会同时触发外层跳转）。改成最外层是一个 `role="link"` 的
 *    `<div>`（`profileHref` 提供时才挂 role/tabIndex/onClick/onKeyDown
 *    这些可点击属性，不提供就是纯展示，跟原来 `profileHref ?` 判断显隐
 *    是同一个语义），点击/回车用 `useNavigate()` 触发跳转；铅笔角标是
 *    内部单独的 `<Link>`，点击时 `stopPropagation()`，不会冒泡触发外层
 *    整卡的点击（照抄这个仓库里 favorite-button.tsx"嵌套在可点击容器里
 *    的按钮，点击要 stopPropagation"这同一个模式）。这个铅笔角标的
 *    aria-label 用"编辑资料"而不是"编辑个人信息"——profile-page.tsx
 *    下面"账号与服务"卡片里已经有一行同目标（/profile/edit）、文案是
 *    "编辑个人信息"的 GroupRow，两个可访问名字如果完全相同，屏幕阅读器
 *    用户没法单靠名字区分"页面上到底是哪一个入口"，所以特意用了不同的
 *    措辞，指向的路由和行为完全一样。
 * 4. 昵称和年龄改成同一行——年龄从"简介下面单独一行纯文字"变成跟昵称
 *    并排的小胶囊（浅灰底圆角标签，字号比昵称小一档），简介保持独立
 *    一行，挪到这一行下面（原来简介在昵称行下面、年龄在简介下面，现在
 *    简介和年龄的相对顺序换了，但各自的判空渲染逻辑都没有变）。
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
  profileHref,
  bio,
  age,
  children
}: ProfileSummaryProps) {
  const navigate = useNavigate();
  const avatarInitial = displayName?.trim().charAt(0).toUpperCase() || "?";

  function handleCardClick(): void {
    if (profileHref) {
      navigate(profileHref);
    }
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // role="link" 的键盘激活键是 Enter（不是 Space——Space 是 role="button"
    // 的语义），跟原生 <a> 的键盘行为保持一致。
    if (profileHref && event.key === "Enter") {
      event.preventDefault();
      navigate(profileHref);
    }
  }

  function handleEditClick(event: MouseEvent<HTMLAnchorElement>): void {
    // 阻止冒泡到外层整卡的 onClick——点铅笔应该只跳 /profile/edit，
    // 不应该同时触发外层跳到 profileHref。
    event.stopPropagation();
  }

  return (
    <div
      className={`rounded-profile-card bg-card p-3.5 ${profileHref ? "cursor-pointer" : ""}`}
      role={profileHref ? "link" : undefined}
      aria-label={profileHref ? "查看个人主页" : undefined}
      tabIndex={profileHref ? 0 : undefined}
      onClick={profileHref ? handleCardClick : undefined}
      onKeyDown={profileHref ? handleCardKeyDown : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center">
          {/* 头像容器：relative 定位，给右下角的铅笔编辑角标当锚点。 */}
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-bg text-xl font-semibold text-text-muted"
              >
                {avatarInitial}
              </div>
            )}
            <Link
              to="/profile/edit"
              aria-label="编辑资料"
              onClick={handleEditClick}
              className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-text-muted"
            >
              <Pencil size={12} aria-hidden="true" />
            </Link>
          </div>

          {/* 不用 <h1>——这个页面的 <h1> 已经是 sr-only 的"我的"
              （profile-page.tsx），这里再来一个 <h1> 就是重复的页面
              主标题。年龄跟昵称同一行，做成小胶囊。 */}
          <div className="ml-3.5 flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate text-base font-semibold text-text">
              {displayName ?? "未知用户"}
            </p>
            {age !== null && age !== undefined ? (
              <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
                {age} 岁
              </span>
            ) : null}
          </div>
        </div>

        {/* 纯装饰性箭头，提示"这一整块可点"，本身没有独立的点击行为——
            点击行为挂在最外层容器上。 */}
        {profileHref ? (
          <ChevronRight aria-hidden="true" size={20} className="ml-2 shrink-0 text-chevron" />
        ) : null}
      </div>

      {/* 简介：判空渲染逻辑照抄 user-profile-page.tsx data.bio 的写法——
          为空整段不渲染，不展示"简介未填写"这类占位文案。 */}
      {bio ? (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-text">{bio}</p>
      ) : null}

      {children}
    </div>
  );
}

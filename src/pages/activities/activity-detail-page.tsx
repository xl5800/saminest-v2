import { Share } from "@capacitor/share";
import { Flag, Share2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { ActivityFavoriteButton } from "../../components/activity-favorite-button";
import { ActivityParticipantAvatars } from "../../components/activity-participant-avatars";
import { ActivityParticipationButtonView } from "../../components/activity-participation-button";
import { CommentSection } from "../../components/comment-section";
import { PersonCard } from "../../components/person-card";
import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { formatLocationDisplayName } from "../../data/us-states";
import { useActivityDetailQuery } from "../../features/activities/use-activity-detail-query";
import { useActivityParticipantsQuery } from "../../features/activities/use-activity-participants-query";
import { useActivityParticipationAction } from "../../features/activities/use-activity-participation-action";
import type { ActivityDetail, ActivityParticipant } from "../../repositories/activities-repository";
import { getActivityChannelMeta } from "../../repositories/activities-repository";
import { useAuthStore } from "../../store/auth-store";
import { PRODUCTION_ORIGIN } from "../../utils/constants";
import { formatActivityStartAt } from "../../utils/format";

/**
 * 任务卡 9（找搭子详情页改版对齐方案图）：拼出"已加入"名单里单个参与者
 * 那一行文字——"{昵称}{age != null ? ' {age}岁' : ''}{locationName != null
 * ? ' · 住{地区}' : ''}"，年龄/地区任一缺失时优雅省略（不出现"undefined"/
 * "null"/多余的分隔符），都缺失时就是单独的昵称。地区名格式化复用
 * formatLocationDisplayName（跟页面顶部"地点"那一行、
 * profiles-repository.ts 的 locationName 现有用法保持一致的格式，不另起
 * 一套规则）。放在组件外面（不是组件内部的闭包函数）——这是一个不依赖任何
 * 组件内部状态的纯格式化函数，没必要每次渲染都重新创建一份。
 *
 * age/locationName 用 `!= null`（宽松判断，同时挡掉 null 和 undefined）
 * 而不是 `!== null`——ActivityParticipant 这两个字段这次改成了可选属性
 * （见该接口定义处的注释：activity-card.test.tsx/
 * activity-participant-avatars.test.tsx 里手写的测试夹具没有这两个字段，
 * 类型上因此允许 undefined），这个页面读到的真实数据永远来自
 * mapActivityParticipantRow（一定显式赋值成 number | null，不会是
 * undefined），但这里按类型本身的宽松程度防御性地处理，不假设"实际不会
 * 发生"就只判断 null 这一种情况。
 */
function formatJoinedParticipantLine(participant: ActivityParticipant): string {
  let line = participant.displayName;
  if (participant.age != null) {
    line += ` ${participant.age}岁`;
  }
  if (participant.locationName != null) {
    line += ` · 住${formatLocationDisplayName(participant.locationName)}`;
  }
  return line;
}

/**
 * 活动详情页（/activities/:id，公开，不需要登录，游客也能看，跟
 * post-detail-page.tsx 是同一个可见性模式：报名/退出这类操作需要登录，
 * 但查看详情本身不需要）。
 *
 * "活动不存在" / "当前身份看不到"（被取消、被软删除、或者压根不存在）
 * 统一渲染同一条文案，不做区分——理由跟 post-detail-page.tsx 完全一致：
 * 区分开来会向未授权的访问者泄露"这个 id 存在，只是被取消了"这种信息，
 * getActivityDetail 已经在 repository 层把这些情况收敛成同一个 null。
 *
 * 任务卡 9（找搭子详情页改版对齐方案图）：按产品给的方案图重排了页面顺序，
 * 现在从上到下是：标题 → 地点 → 时间 → "活动描述"小标题+正文 → 联系方式
 * （若有）→ 头像拼图（含参与人数文案）→ 仅发起人可见的"📢通知参与者"链接
 * → 发起人 PersonCard → "已加入"参与者名单（本卡新增，见下面单独说明）→
 * 底部按钮行。删除了两处冗余信息：频道/标签徽章 chip（频道已经通过标题里
 * 的 emoji 表达）、"发起人：{昵称}"文字链接（发起人身份已经通过下面的
 * PersonCard 展示）。头像拼图/"📢通知参与者"/联系方式/底部按钮这几块的
 * 内部逻辑和判断条件完全没动，只是位置跟着挪；"活动描述"这个小标题是这次
 * 新加的（改版前描述正文上面没有任何标题文字，直接跟在联系方式下面）。
 *
 * "已加入"参与者名单：对 participants（不含发起人，跟头像拼图用的是同
 * 一份 useActivityParticipantsQuery 数据，没有另外发一次查询）逐个渲染一
 * 行，内容用上面的 formatJoinedParticipantLine 拼。participants 为空
 * （活动目前只有发起人自己）时这个区块整体不渲染——不显示"暂无人加入"这
 * 类占位文案，跟 ActivityParticipantAvatars 自己处理空态的克制程度一致
 * （那边也不会为"一个参与者都没有"单独展示什么提示文字，只是头像格全部
 * 变成空位）。方案图没有明确具体排版细节（字号/间距/要不要头像小图标），
 * 按这个页面已有的"带边框的圆角小卡片"视觉语言处理（跟地点/联系方式两个
 * 区块是同一套 border-border 圆角容器），不强求逐像素还原方案图。
 *
 * 任务卡（活动详情页——发起人不能报名自己的活动 +"已加入"名单加头像/
 * 简介）："已加入"名单这次改版：外层 `<ul>` 去掉了 divide-y divide-border
 * + 整体的 border-border 卡片容器（原来是一整块带边框的白色卡片、行与行
 * 之间靠分隔线区分），换成 `space-y-3` 纯间距、每行各自是独立的一个
 * flex 行，不再有任何边框/分隔线——每行左边加圆形头像（复用
 * person-card.tsx 已经在用的"有头像用 img，没有就是首字母兜底圆圈
 * （bg-primary/10 + text-primary）"这套样式，不是另起一套），右边
 * formatJoinedParticipantLine 拼的那行文字（昵称/年龄/地区，逻辑不变）
 * 下面新增一行 bio（个人简介），用 `truncate` 单行省略号截断（跟
 * my-posts-page.tsx 里同类"次要说明文字"用的是同一个截断方式），
 * participant.bio 为空/null 时这一行整体不渲染。ActivityParticipant 类型
 * 和 listActivityParticipants/listActivityParticipantPreviews 共用的
 * mapActivityParticipantRow 因此新增了 bio 字段（取法照抄 age/
 * locationName，见 activities-repository.ts 对应注释）——BARRY 确认过
 * "还差 N 人"这个人数计算逻辑本身没问题，这次没有碰 participant_count/
 * capacity 相关的任何计算。
 *
 * 04 号卡（find-buddy-flow）改版：顶部换成 TopBar 的 detail 变体（返回
 * 箭头 + "…"更多菜单），原来页面底部平铺的"收藏/分享/举报"操作行收进了
 * 这个更多菜单。
 *
 * design_handoff_saminest_ios 第 4 项（详情页底部操作栏重排）：设计稿
 * （07-activity-detail-top.png）把"收藏"和"分享"从"…"更多菜单里挪回了
 * 页面底部固定操作栏（收藏｜报名参加｜分享，跟帖子详情页底部工具栏是同一
 * 种"图标+文字竖排在两侧、中间一个撑满的主按钮"布局），"…"菜单里只留
 * 举报——这算是对 04 号卡那次改版的部分推翻，BARRY 看过设计稿截图后确认
 * 要按设计稿改（详见跟 ActivityFavoriteButton 相关的这次改动说明）。
 * ActivityFavoriteButton 新增了 `variant="icon"` 给这个底部栏用（照抄
 * favorite-button.tsx 的 icon 变体视觉），moreMenu 原来的横向菜单行样式
 * （`variant="menu"`，默认值）保留给"…"菜单以外没有别的调用点。分享按钮
 * 的点击逻辑（handleShare）完全没变，只是从菜单里的一行文字链接换成了
 * 底部栏的竖排图标按钮，跟帖子详情页分享按钮同一个视觉写法。
 *
 * 发起人卡片这次加了一个右侧 chevron（纯装饰，不改变可点击范围——整张
 * 卡片本来就是一个 <Link>）：明确提示"这一整行可点，会跳发起者主页"，
 * 跟详情页/发起者主页之间的导航关系在视觉上对应起来。
 *
 * 23 号卡（帖子详情页顶部+操作区改版）：这张"发起人卡片"抽成了共享组件
 * `PersonCard`（见 person-card.tsx），帖子详情页新增的"发帖者卡片"复用
 * 同一个组件（传不同的 subtitle 文案），这里改成调用 `<PersonCard
 * userId={...} displayName={...} avatarUrl={...} subtitle="发起人" />`，
 * 不再是这个页面自己内联的一段 JSX——渲染结果跟改动前逐字节一致，唯一的
 * 例外是顺手修正了一个既有小 bug：原来 chevron 用的 `text-chev` 类名从来
 * 没有对应的 token（真正的 token 是 `text-chevron`），抽取时一并改成了
 * 正确的类名，chevron 颜色从"默认黑"变成设计要求的浅灰。
 *
 * 任务卡 4（发起人群发通知参与者）：新增 isOrganizer 判断（session.user.id
 * 是不是等于 data.organizerId，这个页面之前完全没有这层判断，之前只区分
 * "登录/未登录"决定报名按钮能不能点，不区分"是不是发起人"），只在为真时
 * 在参与者头像区块下方展示"📢通知参与者"链接，跳转独立路由
 * /activities/:id/notify（见 activity-notify-page.tsx）——这里只是入口，
 * 真正的权限强制在那个页面 + notify_activity_participants() 数据库函数
 * 那两层，不是靠这里隐藏链接就足够安全。
 *
 * 一致性的关键点：这个页面只调用一次 useActivityParticipationAction，把
 * 同一个 `participationAction` 对象分别交给 ActivityParticipationButtonView
 * （渲染"参加活动"按钮）和 ActivityParticipantAvatars 的
 * onTapEmptySlot/canTapEmptySlot（驱动头像堆叠里的空位点击）——两个入口
 * 背后是同一个 mutation 实例、同一份 disabled 判断，不是分别独立调用两次
 * hook 各自维护一套状态，见 activity-participation-button.tsx 顶部注释。
 *
 * 单栏列表页精简：原来的"参与者（N）"文字名单区块和"查看发起人"按钮都去
 * 掉了——头像堆叠本身呈现头像（产品明确接受的取舍），发起人卡片本来就整
 * 条包在 <Link to="/users/:id"> 里，去掉旁边的"查看发起人"按钮之后它自然
 * 就是"点击进入发起人主页"的唯一入口，不需要额外补什么。
 * useActivityParticipantsQuery 这个查询本身没有删——ActivityParticipantAvatars
 * 仍然需要它的返回值渲染头像堆叠，任务卡 9 新增的"已加入"文字名单也是用
 * 同一份数据，不是另外发一次查询。社交资料页第一批留下的"发起人：{名字}"
 * 文字链接（原来跟发起人卡片指向同一个 /users/:id、允许重复展示）任务卡 9
 * 已经删掉了——发起人身份现在只靠下面的 PersonCard 展示，不再重复。
 *
 * design_handoff_saminest_ios 第 4 项：上面这条"联系发起人"按钮这次删掉
 * 了——设计稿的底部操作栏只有"收藏｜报名参加｜分享"三项，没有咨询/联系类
 * 按钮（README 原文明确写了"不要咨询按钮"），"参加活动"改成独占底部主按钮
 * 的位置（flex-1，不再跟联系发起人各占半行）。这是任务卡 3 那次产品决定的
 * 一次推翻，不是这次顺手改的——BARRY 看过现状和设计稿截图的差异后明确选择
 * 按设计稿改。连带删除的：useCreateActivityConversationMutation 这个 hook
 * 调用、handleContactOrganizerClick 处理函数、contactError 状态、
 * CONTACT_ORGANIZER_DEFAULT_ERROR_MESSAGE 常量，以及不再需要的 navigate/
 * currentUserId（这两个此前只有联系发起人这一处在用）。
 * useCreateActivityConversationMutation 这个 hook 本身、它背后的
 * conversations-repository.ts 里的 createActivityConversation() 函数都没有
 * 删除或改动——只是这个页面不再调用它，其它调用点（"一起去"报名/退出通知
 * 发起人那一步）不受影响。
 *
 * 找搭子留言区任务卡：页面最下面接入 `<CommentSection activityId={data.id} />`
 * （参照 post-detail-page.tsx 接 `<CommentSection postId={id} />` 的同一个
 * 位置——页面正文最下面），复用同一个 CommentSection 组件，只是传
 * activityId 而不是 postId——见 comment-section.tsx 顶部注释里对这次
 * 泛化的说明。这个页面本身除了多这一行渲染之外不需要任何改动：留言数量
 * 从 activities.comment_count 来（这次顺带给 getActivityDetail 加了这一
 * 列，见 activities-repository.ts），CommentSection 内部自己再查一次
 * useActivityDetailQuery(activityId) 命中缓存，不会多发请求。
 *

 * 任务卡（活动详情页——发起人不能报名自己的活动）：这个页面之前完全没有
 * 判断"当前登录用户是不是发起人"就允许点"参加活动"（唯一的例外是上面
 * 任务卡 4 加的那个纯前端的 isOrganizer 局部变量，只用来决定要不要展示
 * "📢通知参与者"链接，从来没有跟报名按钮的可点性挂钩）——发起人理论上
 * 可以对自己发起的活动点"我要报名"。这次在
 * useActivityParticipationAction 内部新增了一个 isOrganizer 判断分支
 * （`userId === organizerId` 时 disabled 恒为 true、文案变成"你是发起人，
 * 不能报名自己发起的活动"，具体见该 hook 的注释），这个页面本身不需要
 * 改：canTapEmptySlot = `!participationAction.disabled && !participationAction.isApproved`
 * 这一行不用动，新分支 disabled 已经是 true，头像堆叠的空位自然也点不动。
 * 数据库层同步补了一条 RLS 校验兜底（activity_participants_insert_own
 * 加了 organizer_id 不等于 user_id 的条件，见对应迁移文件），不是只在
 * 前端隐藏/禁用按钮就足够——BARRY 明确要求这次改动不动"还差 N 人"这个
 * 人数计算逻辑，这里也确实没有碰 participant_count 相关的任何代码。
 */
export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const session = useAuthStore((s) => s.session);

  const { data, isPending, isError } = useActivityDetailQuery(id ?? "");
  const { data: participants } = useActivityParticipantsQuery(id ?? "");

  const isOrganizer = !!session && !!data && session.user.id === data.organizerId;

  const participationAction = useActivityParticipationAction({
    activityId: id ?? "",
    activityStatus: data?.status ?? "",
    organizerId: data?.organizerId ?? "",
    activityTitle: data?.title ?? "",
    requiresApproval: data?.requiresApproval ?? false
  });

  const canTapEmptySlot = !participationAction.disabled && !participationAction.isApproved;

  async function handleShare(activity: ActivityDetail): Promise<void> {
    if (!id) return;
    try {
      await Share.share({
        title: activity.title,
        text: `${formatActivityStartAt(activity.startAt)}・${
          activity.isOnline
            ? "线上活动"
            : activity.landmarkText ??
              (activity.locationName ? formatLocationDisplayName(activity.locationName) : "地点待定")
        }`,
        url: `${PRODUCTION_ORIGIN}/activities/${id}`,
        dialogTitle: "分享"
      });
    } catch (error) {
      // 用户主动关掉系统分享面板也会让这个 promise reject，跟
      // post-detail-page.tsx 的 handleShare 是同一个"两种情况都静默吞掉"
      // 的处理方式，见那边的详细注释。
      console.error("分享失败：", error);
    }
  }

  return (
    <main data-testid="activity-detail-page">
      <TopBar
        variant="detail"
        moreMenu={
          data
            ? {
                label: "更多操作",
                content: (
                  <Link
                    to={`/activities/${data.id}/report`}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text hover:bg-bg hover:text-danger"
                  >
                    <Flag size={16} aria-hidden="true" />
                    举报
                  </Link>
                )
              }
            : undefined
        }
      />

      {/* BARRY 反馈"顶栏分隔线跟标题贴太近"任务卡：这个容器原来没有任何顶部
          内边距，标题 <h1> 直接贴着 TopBar 卡片底部那条 border-b 分隔线。
          补一个 pt-4（16px），数值取跟下面 `space-y-4` 区块间距相同的档
          位——让标题看起来是"内容区的第一项"、跟下面各区块节奏一致，而不是
          被顶栏挤出来的。只加这一个页面自己的内边距，不动 TopBar 组件本身
          （TopBar 的 detail 变体目前只有这一个页面在用，不会影响别处）。 */}
      <div className="mx-auto max-w-2xl px-4 pt-4 pb-20 md:pb-6">
        {/* 高频页面骨架屏任务卡：这个页面没有帖子详情页那种大图轮播，占位
            按真实内容顺序给标题行 → 地点框（容器 class 照抄下面真实地点框
            的 rounded-lg border border-border bg-bg p-3）→ 时间行（较短）→
            "活动描述"小节（短标题+2-3 行正文）。sr-only 文字保留原来的
            无障碍播报，骨架块本身是纯视觉装饰。 */}
        {isPending ? (
          <div role="status">
            <span className="sr-only">加载中…</span>
            <div className="space-y-4">
              <Skeleton className="h-6 w-4/5" />
              <div className="rounded-lg border border-border bg-bg p-3">
                <Skeleton className="h-4 w-2/3" />
              </div>
              <Skeleton className="h-4 w-1/4" />
              <div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1.5 h-4 w-full" />
                <Skeleton className="mt-1.5 h-4 w-1/2" />
              </div>
            </div>
          </div>
        ) : null}

        {isError ? <p role="alert">活动加载失败，请稍后重试。</p> : null}

        {!isPending && !isError && data === null ? (
          <>
            <h1>活动未找到</h1>
            <p role="alert">活动不存在或已被取消。</p>
          </>
        ) : null}

        {!isPending && !isError && data ? (
          <div className="space-y-4">
            {/* 1. 标题——任务卡 9：频道/标签徽章 chip 删掉了（频道已经通过
                emoji 表达），"发起人：{昵称}"文字链接也删掉了（发起人身份
                下面的 PersonCard 已经展示，见页面顶部注释）。 */}
            <h1 className="text-xl font-bold text-text">
              {getActivityChannelMeta(data.channel).emoji} {data.title}
            </h1>

            {/* 2. 地点 */}
            <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
              <p>
                {data.isOnline
                  ? "线上活动"
                  : (data.landmarkText ??
                    (data.locationName ? formatLocationDisplayName(data.locationName) : "地点待定"))}
              </p>
              {!data.isOnline && data.locationName ? (
                <p className="mt-1 text-xs text-text-muted">
                  {formatLocationDisplayName(data.locationName)}
                </p>
              ) : null}
            </div>

            {/* 3. 时间 */}
            <p className="text-sm text-text-muted">{formatActivityStartAt(data.startAt)}</p>

            {/* 4. 活动描述——"活动描述"这个小标题是任务卡 9 新加的，改版前
                描述正文没有单独的标题文字。 */}
            <div>
              <h2 className="mb-1 text-sm font-semibold text-text">活动描述</h2>
              <p className="whitespace-pre-wrap break-words text-sm text-text">{data.description}</p>
            </div>

            {/* 5. 联系方式（若有）——展示逻辑/判断条件不变，只是位置往上挪。 */}
            {data.contactMethod && data.contactValue ? (
              <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
                <p className="text-text-muted">联系方式（{data.contactMethod}）</p>
                <p className="break-words font-medium">{data.contactValue}</p>
              </div>
            ) : null}

            {/* 6. 参与者头像拼图——17 号卡：详情页头像换成跟活动卡片一样的
                方块（带小圆角）形状，并且不再封顶/不出现"+N"——
                showAllParticipants 让组件展示全部参与者、并在网格上方加一行
                "共 X 人参加"。空位点击（canTapEmptySlot/onTapEmptySlot）这
                一套逻辑完全没动，只是空位格子本身也从圆形变成了方块。这一
                块本身的 props/样式任务卡 9 没有改，只是位置往下挪。 */}
            <ActivityParticipantAvatars
              organizerId={data.organizerId}
              organizerDisplayName={data.organizerDisplayName}
              organizerAvatarUrl={data.organizerAvatarUrl}
              participants={participants ?? []}
              capacity={data.capacity}
              canTapEmptySlot={canTapEmptySlot}
              onTapEmptySlot={participationAction.handleClick}
              shape="square"
              showAllParticipants
            />

            {/* 7. 仅发起人可见的"📢通知参与者"链接——紧跟在头像拼图下面，
                两者相对位置保持不变（任务卡 9 明确要求不要拆开）。 */}
            {isOrganizer ? (
              <Link
                to={`/activities/${data.id}/notify`}
                className="block w-full rounded-lg border border-primary px-4 py-2 text-center text-sm font-semibold text-primary hover:bg-primary/5"
              >
                📢 通知参与者
              </Link>
            ) : null}

            {/* 8. 发起人 PersonCard */}
            <PersonCard
              userId={data.organizerId}
              displayName={data.organizerDisplayName}
              avatarUrl={data.organizerAvatarUrl}
              subtitle="发起人"
            />

            {/* 9. "已加入"参与者名单（任务卡 9 新增）——participants 为空
                （活动目前只有发起人自己）时整个区块不渲染，不显示"暂无人
                加入"这类占位文案，见页面顶部注释。 */}
            {participants && participants.length > 0 ? (
              <div>
                <h2 className="mb-1 text-sm font-semibold text-text">已加入</h2>
                <ul aria-label="已加入的参与者" className="space-y-3">
                  {participants.map((participant) => (
                    <li key={participant.userId} className="flex items-start gap-3">
                      {participant.avatarUrl ? (
                        <img
                          src={participant.avatarUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                        >
                          {participant.displayName.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-sm text-text">{formatJoinedParticipantLine(participant)}</p>
                        {participant.bio ? (
                          <p className="mt-0.5 truncate text-xs text-text-muted">{participant.bio}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <CommentSection activityId={data.id} />
          </div>
        ) : null}
      </div>

      {/* design_handoff_saminest_ios 第 4 项：底部固定操作栏，跟
          post-detail-page.tsx 的写法是同一套（fixed 定位、白底+顶部细
          边框、左右各一个竖排图标按钮、中间一个 flex-1 的主按钮，安全区
          适配也是同一行 style）——收藏用 ActivityFavoriteButton 新增的
          `variant="icon"`，分享是这个页面本来就有的 handleShare，中间是
          "参加活动"按钮（ActivityParticipationButtonView，这次改成独占
          flex-1，不再跟"联系发起人"各占半行，那个按钮已经按设计稿删掉，
          见页面顶部注释）。整条栏跟正文一样等 data 加载成功才渲染——分享
          需要 data.title 拼文案，报名按钮也需要 data 里的 status/
          organizerId 等字段，跟正文其它区块要求一致。 */}
      {data ? (
        <div
          data-testid="activity-detail-action-bar"
          className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-border bg-card px-4 pt-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <ActivityFavoriteButton activityId={data.id} variant="icon" />
          <div className="flex-1">
            <ActivityParticipationButtonView action={participationAction} />
          </div>
          <button
            type="button"
            onClick={() => void handleShare(data)}
            className="flex flex-col items-center gap-1 text-text-muted hover:text-primary"
          >
            <Share2 size={22} aria-hidden="true" />
            <span className="text-xs">分享</span>
          </button>
        </div>
      ) : null}
    </main>
  );
}

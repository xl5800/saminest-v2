import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "../types/database.generated";
import { AppError } from "../utils/app-error";

/**
 * 固定频道枚举，对应 activities.channel 的 check 约束，见
 * docs/01_Product/FindBuddy-Design.md 第 1 节。"其他"设计文档里没有给
 * emoji（原文只写"其他"），这里补一个中性的 🔖，不代表任何具体场景。
 */
export const ACTIVITY_CHANNEL_OPTIONS = [
  { value: "food", label: "吃饭搭子", emoji: "🍜" },
  { value: "carpool", label: "拼车/一起采购", emoji: "🚗" },
  { value: "fitness", label: "健身搭子", emoji: "🏋️" },
  { value: "game", label: "游戏搭子", emoji: "🎮" },
  { value: "study", label: "学习搭子", emoji: "📚" },
  { value: "travel", label: "旅游搭子", emoji: "✈️" },
  { value: "entertainment", label: "娱乐搭子", emoji: "🎬" },
  { value: "other", label: "其他", emoji: "🔖" }
] as const;

export type ActivityChannel = (typeof ACTIVITY_CHANNEL_OPTIONS)[number]["value"];

const ACTIVITY_CHANNEL_VALUES: readonly string[] = ACTIVITY_CHANNEL_OPTIONS.map(
  (option) => option.value
);

export function isActivityChannel(value: string): value is ActivityChannel {
  return ACTIVITY_CHANNEL_VALUES.includes(value);
}

const ACTIVITY_CHANNEL_META: Record<string, { label: string; emoji: string }> =
  Object.fromEntries(
    ACTIVITY_CHANNEL_OPTIONS.map((option) => [
      option.value,
      { label: option.label, emoji: option.emoji }
    ])
  );

/**
 * 卡片/详情页展示频道 emoji+文案用。理论上 channel 不应该出现枚举之外的
 * 值（数据库有 check 约束），但防御性处理一下，未知值退回一个占位，不让
 * 页面崩掉——跟 posts-repository.ts 里"联表可能返回 null 时退回占位文案"
 * 是同一个原则。
 */
export function getActivityChannelMeta(channel: string): { label: string; emoji: string } {
  return ACTIVITY_CHANNEL_META[channel] ?? { label: channel, emoji: "🔖" };
}

export interface ActivityListItem {
  id: string;
  organizerId: string;
  organizerDisplayName: string;
  organizerAvatarUrl: string | null;
  channel: string;
  tagText: string | null;
  title: string;
  locationName: string | null;
  landmarkText: string | null;
  isOnline: boolean;
  startAt: string;
  capacity: number | null;
  participantCount: number;
  status: string;
  requiresApproval: boolean;
}

export interface ListActivitiesInput {
  channel?: string;
  /** 08 号卡：从"选一个具体的 locationId（只能是 locations 表里已有的
   *  DC/VA/MD 三个 state 行之一）"换成"按州代码筛选"——跟首页信息流筛选是
   *  同一套机制（useSelectedRegionStore 选中的 stateCode），全美 51 项里
   *  大多数州在 locations 表里根本没有对应的行，不可能有一个 locationId
   *  可选，只有 stateCode 这个纯字符串筛选条件能覆盖全部 51 项。原来的
   *  locationId 参数已删除——唯一消费者是 activity-list-page.tsx 自己的
   *  「筛选」下拉框，那个下拉框本身也在这次改动里被移除了（见该页面顶部
   *  注释），不是留一个不再使用的兼容参数。 */
  stateCode?: string;
}

interface ActivityListRow {
  id: string;
  organizer_id: string;
  channel: string;
  tag_text: string | null;
  title: string;
  location: { name: string } | null;
  landmark_text: string | null;
  is_online: boolean;
  start_at: string;
  capacity: number | null;
  participant_count: number;
  status: string;
  requires_approval: boolean;
  organizer: { display_name: string; avatar_url: string | null } | null;
}

/**
 * 活动列表页（/activities）用。默认只展示 status in ('open', 'full') 且
 * start_at >= now() 的活动——这两条过滤是产品要求的默认视图，不是 RLS
 * 强制的：activities_select_public 这条 RLS 策略只排除软删除和
 * status = 'cancelled' 的行，'ended'（已结束）的活动理论上仍然可以被直接
 * 用 id 查到（详情页场景），但不应该出现在默认浏览列表里，所以这两条
 * 过滤条件必须在这一层显式加，不能指望 RLS 替我们做。
 *
 * 按 start_at 升序（最快开始的排最前面）——故意跟 posts 那套"最新发布的
 * 排最前面"（created_at desc）不同：这是一个"找马上能加入的活动"的浏览
 * 场景，用户更关心"什么时候开始"而不是"什么时候发布"，一个明天就开始的
 * 活动比三周后才开始的活动更值得排在前面，不管两者哪个是先创建的。
 *
 * channel/stateCode 两个筛选都是可选的精确匹配（不是像 posts 搜索那样
 * 的模糊匹配）。stateCode 筛选（08 号卡新增，取代原来的 locationId）就是
 * "同州"这个产品要求本身（见设计文档第 5 节问题 2：不做真实地理距离，
 * 复用 locations 表的州/城市粒度）。
 */
// activities 列表查询共用的 select 列表：activity-list-page.tsx（公开浏览）、
// my-activities-page.tsx 的"我发起的"/"我报名的"两个 tab 都要展示同一组
// 卡片字段（频道/标签/标题/地点/时间/人数/状态），三处场景过滤条件不同、
// 但拿到行之后映射成 ActivityListItem 的逻辑完全一样，抽成一个共享的列
// 字符串 + 映射函数，不在三个查询函数里各写一遍容易漏改的重复代码。
//
// organizer_id 也在这里带出来（不是新开的敏感字段——getActivityDetail
// 早就在公开返回这一列，activities_select_public 允许任何人读取）：
// my-activities-page.tsx"我报名的" tab 的退出按钮要用它调
// useToggleActivityParticipationMutation（跟活动详情页的退出按钮走同一个
// hook，成功后才会顺带给发起人发私信通知），不然那个 hook 拿不到通知
// 收件人是谁。
//
// requires_approval 同理（P2 报名审核制）：卡片本身不展示这个字段，但
// my-activities-page.tsx"我发起的" tab 要靠它判断某张卡片要不要展示
// "待审核申请"这个展开区块，ActivityParticipationButton 也要靠它决定
// 报名按钮文案是"我要报名"还是"申请加入"——同一个"给字段加到共享 select
// 列"的模式，参照上次给 organizerId 加字段那次改动，不新建一套查询。
//
// organizer:profiles(display_name, avatar_url) 是活动列表单栏改版（Meet5
// 头像堆叠卡片）新加的——跟 getActivityDetail 已经在用的写法一致。这一列
// 会同时影响 listActivities/listMyOrganizedActivities/listMyJoinedActivities
// 三个函数的返回值（都走这个共享 select），这是预期的：只有
// activity-list-page.tsx 真正用它渲染头像堆叠，my-activities-page.tsx 的
// 两个 tab 多出这两个字段但不用，不算破坏性变更，不需要为了"只有一处用"
// 就拆成两套 select。
// 08 号卡：listActivities 按 stateCode 筛选时，location 这一列需要从默认
// 的左连接换成 `locations!inner(...)`——PostgREST 要求这么写才能对内嵌表
// 的列（state_code）做过滤，见下面 listActivities 里的用法，跟
// posts-repository.ts listApprovedPosts 是同一个处理方式。
// listMyOrganizedActivities/listMyJoinedActivities 这两个函数不需要这个
// 筛选，继续用下面固定的左连接版本（ACTIVITY_LIST_SELECT_COLUMNS），不受
// 影响。
function buildActivityListSelectColumns(locationJoin: "left" | "inner"): string {
  const locationSelect =
    locationJoin === "inner" ? "location:locations!inner(name, state_code)" : "location:locations(name)";
  return `id, organizer_id, channel, tag_text, title, ${locationSelect}, landmark_text, is_online, start_at, capacity, participant_count, status, requires_approval, organizer:profiles(display_name, avatar_url)`;
}

const ACTIVITY_LIST_SELECT_COLUMNS = buildActivityListSelectColumns("left");

function mapActivityListRow(row: ActivityListRow): ActivityListItem {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    organizerDisplayName: row.organizer?.display_name ?? "未知用户",
    organizerAvatarUrl: row.organizer?.avatar_url ?? null,
    channel: row.channel,
    tagText: row.tag_text,
    title: row.title,
    locationName: row.location?.name ?? null,
    landmarkText: row.landmark_text,
    isOnline: row.is_online,
    startAt: row.start_at,
    capacity: row.capacity,
    participantCount: row.participant_count,
    status: row.status,
    requiresApproval: row.requires_approval
  };
}

export async function listActivities(
  input: ListActivitiesInput = {}
): Promise<ActivityListItem[]> {
  const nowIso = new Date().toISOString();
  const selectColumns = input.stateCode
    ? buildActivityListSelectColumns("inner")
    : ACTIVITY_LIST_SELECT_COLUMNS;

  let query = getSupabaseClient()
    .from("activities")
    .select(selectColumns)
    .in("status", ["open", "full"])
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true });

  if (input.channel) {
    query = query.eq("channel", input.channel);
  }
  if (input.stateCode) {
    query = query.eq("location.state_code", input.stateCode);
  }

  const { data, error } = await query.overrideTypes<ActivityListRow[]>();

  if (error) {
    throw new AppError(error.message, "ACTIVITIES_LIST_FAILED", error);
  }

  return (data ?? []).map(mapActivityListRow);
}

/**
 * "我的活动"页面（/my-activities）"我发起的" tab 用：当前用户作为发起人的
 * 全部活动，不限状态（包括已取消/已结束的历史活动，管理页需要能看到
 * 完整记录，不只是还在招募中的）。activities_select_own 这条 RLS 早就
 * 允许发起人查自己任意状态的活动，这里不需要新权限。
 *
 * 按 start_at 升序（最快开始的活动排最前面）——跟 listActivities（公开
 * 列表页）保持一致：用户更关心"下一个要发生的活动是什么时候"，方便记得
 * 到场或者临时取消，不是"最近发布/更新的排前面"那种 listMyPosts 式的
 * created_at desc 直觉。之前用过降序，已按反馈改回来跟 listActivities
 * 统一，不要再改回降序。
 */
export async function listMyOrganizedActivities(
  organizerId: string
): Promise<ActivityListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("activities")
    .select(ACTIVITY_LIST_SELECT_COLUMNS)
    .eq("organizer_id", organizerId)
    .order("start_at", { ascending: true })
    .overrideTypes<ActivityListRow[]>();

  if (error) {
    throw new AppError(error.message, "MY_ORGANIZED_ACTIVITIES_LIST_FAILED", error);
  }

  return (data ?? []).map(mapActivityListRow);
}

export interface ActivityDetail {
  id: string;
  organizerId: string;
  organizerDisplayName: string;
  organizerAvatarUrl: string | null;
  channel: string;
  tagText: string | null;
  title: string;
  description: string;
  locationId: string | null;
  locationName: string | null;
  landmarkText: string | null;
  isOnline: boolean;
  startAt: string;
  capacity: number | null;
  participantCount: number;
  contactMethod: string | null;
  contactValue: string | null;
  status: string;
  requiresApproval: boolean;
}

interface ActivityDetailRow {
  id: string;
  organizer_id: string;
  channel: string;
  tag_text: string | null;
  title: string;
  description: string;
  location_id: string | null;
  landmark_text: string | null;
  is_online: boolean;
  start_at: string;
  capacity: number | null;
  participant_count: number;
  contact_method: string | null;
  contact_value: string | null;
  status: string;
  requires_approval: boolean;
  location: { name: string } | null;
  organizer: { display_name: string; avatar_url: string | null } | null;
}

/**
 * 活动详情页用。不额外加 status/deleted_at 过滤——可见性完全交给
 * activities_select_public（游客/非发起人只能看未软删除且非 cancelled 的
 * 活动）和 activities_select_own（发起人能看自己任何状态的活动）这两条
 * RLS 策略，跟 posts-repository.ts 的 getPostDetail 是同一个"RLS 决定
 * 可见性，这一层不重复判断"的原则。查不到（不存在，或者当前身份看不到）
 * 统一返回 null，不区分具体原因，避免向未授权访问者泄露"这个 id 存在，
 * 只是被取消了/软删除了"这种信息。
 *
 * 联系方式（contact_method/contact_value）不做额外的"只有报名的人才能看"
 * 限制，跟帖子详情页的联系方式展示是同一个尺度——这两列本来就在
 * activities_select_public 允许读取的字段范围内，RLS 是行级不是列级，
 * 藏起来对已经能读到这一整行的人没有实际安全意义。
 */
export async function getActivityDetail(activityId: string): Promise<ActivityDetail | null> {
  const { data, error } = await getSupabaseClient()
    .from("activities")
    .select(
      "id, organizer_id, channel, tag_text, title, description, location_id, landmark_text, is_online, start_at, capacity, participant_count, contact_method, contact_value, status, requires_approval, location:locations(name), organizer:profiles(display_name, avatar_url)"
    )
    .eq("id", activityId)
    .maybeSingle()
    .overrideTypes<ActivityDetailRow>();

  if (error) {
    throw new AppError(error.message, "ACTIVITY_DETAIL_FETCH_FAILED", error);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    organizerId: data.organizer_id,
    organizerDisplayName: data.organizer?.display_name ?? "未知用户",
    organizerAvatarUrl: data.organizer?.avatar_url ?? null,
    channel: data.channel,
    tagText: data.tag_text,
    title: data.title,
    description: data.description,
    locationId: data.location_id,
    locationName: data.location?.name ?? null,
    landmarkText: data.landmark_text,
    isOnline: data.is_online,
    startAt: data.start_at,
    capacity: data.capacity,
    participantCount: data.participant_count,
    contactMethod: data.contact_method,
    contactValue: data.contact_value,
    status: data.status,
    requiresApproval: data.requires_approval
  };
}

export interface CreateActivityInput {
  organizerId: string;
  channel: string;
  tagText: string | null;
  title: string;
  description: string;
  locationId: string | null;
  landmarkText: string | null;
  isOnline: boolean;
  startAt: string;
  capacity: number | null;
  contactMethod: string | null;
  contactValue: string | null;
  requiresApproval: boolean;
}

export interface CreateActivityResult {
  id: string;
}

// Postgres/PostgREST 的 insufficient_privilege 错误码，任何 RLS with check
// 失败都会报这个码。
const RLS_VIOLATION_CODE = "42501";
const ACCOUNT_RESTRICTED_MESSAGE =
  "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。";

/**
 * 发布活动。activities_insert_own 的 with check 只有 organizer_id =
 * auth.uid() 和 not is_account_restricted() 两个条件，organizer_id 只
 * 可能来自当前登录用户自己的 session（见 create-activity-page.tsx 唯一
 * 调用点），不接受任意/伪造输入，所以这里的 42501 可以放心归因于账号
 * 受限——跟 posts-repository.ts 的 createPost 是同一个推理，不是每处
 * 42501 都能这样简化（activity_participants 的 insert 策略条件更多，见
 * 下面 joinActivity 的注释，那边就不能这样简化）。
 *
 * status 不接受调用方传入，数据库默认值就是 'open'，这里的 payload 压根
 * 不带这一列——跟 createPost 把 status 硬编码成 'pending'、不接受表单
 * 传入是同一个"系统状态字段不能由用户直接摆布"的原则，只是这里更进一步，
 * 连硬编码赋值都不需要，交给列默认值。
 *
 * requiresApproval（P2）是唯一一个真正由发起人在表单上选择、直接写入的
 * 新字段——跟 status 不同，这不是系统维护的字段，是产品明确要求的"per
 * -activity 开关"，创建之后不能改（这批任务没有编辑活动的入口，见
 * create-activity-page.tsx），所以不需要考虑"发布后改开关会不会打乱正在
 * 进行中的报名审核流程"这种问题。
 */
export async function createActivity(
  input: CreateActivityInput
): Promise<CreateActivityResult> {
  const payload: TablesInsert<"activities"> = {
    organizer_id: input.organizerId,
    channel: input.channel,
    tag_text: input.tagText,
    title: input.title,
    description: input.description,
    location_id: input.locationId,
    landmark_text: input.landmarkText,
    is_online: input.isOnline,
    start_at: input.startAt,
    capacity: input.capacity,
    contact_method: input.contactMethod,
    contact_value: input.contactValue,
    requires_approval: input.requiresApproval
  };

  const { data, error } = await getSupabaseClient()
    .from("activities")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
    throw new AppError(error.message, "ACTIVITY_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError("发布活动后无法读取活动 ID。", "ACTIVITY_CREATE_ID_MISSING");
  }

  return { id: data.id };
}

export type ActivityParticipationStatus = "pending" | "approved" | "rejected" | null;

/**
 * 当前用户对这场活动的报名状态（P2 报名审核制上线后，从单纯的布尔"是否
 * 已报名"扩成四态：null=未参与、pending=申请中待发起人处理、approved=
 * 已报名/已通过、rejected=申请被拒绝）——ActivityParticipationButton 和
 * my-activities-page.tsx"我报名的" tab 都要靠这个状态渲染不同的文案/
 * 可用操作，之前的布尔版本（isCurrentlyJoined）已经不够表达这几种情况，
 * 直接改造成同一个函数返回更丰富的状态，而不是新增一个函数、让调用方
 * 自己再拼一遍"查两次、合并结果"的逻辑。
 *
 * 查不到行、或者查到但已经退出（cancelled_at 不为空）时统一返回
 * null——不区分"从来没申请过"和"申请过又退出了"，理由跟原来的
 * isCurrentlyJoined 完全一样：activity_participants_select_joined 这条
 * RLS 策略要求"自己当前有一条 cancelled_at is null 的记录"才能 select 到
 * 这场活动下的任何行，但 activity_participants_select_own（user_id =
 * auth.uid()，不看 cancelled_at/status）保证用户永远能读到自己这一行，
 * 所以这里始终查得到、只是要在 JS 里过滤"已经不算数"的历史行。
 */
export async function getActivityParticipationStatus(
  activityId: string,
  userId: string
): Promise<ActivityParticipationStatus> {
  const { data, error } = await getSupabaseClient()
    .from("activity_participants")
    .select("status, cancelled_at")
    .eq("activity_id", activityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "ACTIVITY_PARTICIPATION_CHECK_FAILED", error);
  }

  if (!data || data.cancelled_at !== null) {
    return null;
  }

  return data.status as "pending" | "approved" | "rejected";
}

const UNIQUE_VIOLATION_CODE = "23505";
const ACTIVITY_JOIN_FORBIDDEN_MESSAGE = "报名失败，这个活动可能已满员或已结束，请刷新后重试。";
const ACTIVITY_JOIN_REJECTED_MESSAGE = "你的申请已被发起人拒绝，无法重新加入。";
const ACTIVITY_LEAVE_NOT_FOUND_MESSAGE = "你还没有报名这个活动，或者已经退出了。";

/**
 * 报名/申请加入一个活动。P2 报名审核制上线后，INSERT 这一行必须带上正确
 * 的 status，不能再省略、交给列默认值：activity_participants_insert_own
 * 这条 RLS 的 with check 要求 `requires_approval = false` 时插入的行必须
 * 是 'approved'、`requires_approval = true` 时必须是 'pending'，插反了
 * 直接 42501——所以这个函数现在需要调用方提前告诉它目标活动是不是要审核
 * （activity-participation-button.tsx / use-toggle-activity-participation-mutation.ts
 * 从已经查到的 ActivityDetail.requiresApproval 传进来，不在这里为了拿到
 * 这一个字段再单独查一次 activities 表）。
 *
 * 设计文档 3.2 节："退出后重新报名靠把 cancelled_at 置回 null（应用层
 * upsert 逻辑），不插入新行"——但这个"先查一下有没有旧行"的直觉写法在这里
 * 行不通：activity_participants_select_joined 这条 RLS 策略要求"自己当前
 * 有一条 cancelled_at is null 的记录"才能 select 到这场活动下的任何行，
 * 一个刚退出的用户此时恰好没有这样一条记录，所以退出后他自己那条已取消
 * 的历史记录对他自己来说也是不可见的——先 select 判断"是不是已经报名过"
 * 这一步在这个场景下永远查不到东西，没法用来分支。
 *
 * 所以这里反过来：先直接尝试 insert，让 unique(activity_id, user_id)
 * 这条唯一约束替我们判断"是不是已经有一行了"——插入成功就是第一次报名/
 * 申请；撞上 23505 唯一冲突，说明那一行还在（大概率是之前报名/申请又退出
 * 留下的 cancelled_at 不为 null 的记录，也可能是另一个标签页并发插入）。
 *
 * P2 新增的一步：撞冲突之后不能直接尝试 UPDATE 把 cancelled_at 置回
 * null——如果那一行的 status 是 'rejected'（发起人已经拒绝过这次申请），
 * activity_participants_update_own 这条 RLS 的 with check 会挡住这次
 * UPDATE（明确要求 status <> 'rejected' 才允许重新激活），拿到的会是一个
 * 分不清具体原因的 42501（因为同一条 with check 里"活动不再 open"也会
 * 触发一模一样的错误码，见下面这段的详细说明）。为了给用户一条准确、不
 * 过度归因的提示，这里先用 activity_participants_select_own（user_id =
 * auth.uid()，不受 cancelled_at/status 限制）查一下这一行现在的 status：
 * 如果是 'rejected'，直接返回专门的错误文案，不再尝试注定会失败的
 * UPDATE；如果不是（说明这次 42501 大概率是"活动已经不再 open"），走
 * UPDATE 本身失败时的通用兜底文案，不谎称是"被拒绝了"。
 */
export async function joinActivity(
  activityId: string,
  userId: string,
  requiresApproval: boolean
): Promise<void> {
  const payload: TablesInsert<"activity_participants"> = {
    activity_id: activityId,
    user_id: userId,
    status: requiresApproval ? "pending" : "approved"
  };

  const { error: insertError } = await getSupabaseClient()
    .from("activity_participants")
    .insert(payload);

  if (!insertError) {
    return;
  }

  if (insertError.code === UNIQUE_VIOLATION_CODE) {
    const { data: existingRow, error: selectError } = await getSupabaseClient()
      .from("activity_participants")
      .select("status")
      .eq("activity_id", activityId)
      .eq("user_id", userId)
      .maybeSingle();

    if (selectError) {
      throw new AppError(selectError.message, "ACTIVITY_JOIN_FAILED", selectError);
    }
    if (existingRow?.status === "rejected") {
      throw new AppError(ACTIVITY_JOIN_REJECTED_MESSAGE, "ACTIVITY_JOIN_REJECTED");
    }

    const { error: updateError } = await getSupabaseClient()
      .from("activity_participants")
      .update({ cancelled_at: null })
      .eq("activity_id", activityId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      throw new AppError(updateError.message, "ACTIVITY_JOIN_FAILED", updateError);
    }
    // data 为 null 说明这一行此时已经是 cancelled_at is null（比如另一个
    // 标签页/并发请求刚报名成功），当成功处理，不额外报错。
    return;
  }

  if (insertError.code === RLS_VIOLATION_CODE) {
    // activity_participants_insert_own 的 with check 有四个独立条件
    // （账号未受限、user_id = auth.uid()、活动 status = 'open'、插入的
    // status 跟活动的 requires_approval 是否匹配），42501 分不清具体是
    // 哪一个——跟 comments-repository.ts 的 createComment 是同一个情况：
    // "活动已满员/已结束"是真实会在正常使用中触发的场景（比如两个人同时
    // 点最后一个名额），不能像 createActivity 那样简单归因于账号受限，
    // 统一包装成一条通用失败提示。"status 跟 requires_approval 不匹配"
    // 这一条理论上不会在正常调用路径上触发（这个函数自己根据传入的
    // requiresApproval 决定 status，两者必然一致），只有调用方传错
    // requiresApproval 时才会撞上，同样归进这条通用提示，不单独区分。
    throw new AppError(ACTIVITY_JOIN_FORBIDDEN_MESSAGE, "ACTIVITY_JOIN_FORBIDDEN", insertError);
  }

  throw new AppError(insertError.message, "ACTIVITY_JOIN_FAILED", insertError);
}

export interface ActivityParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface ActivityParticipantRow {
  user_id: string;
  user: { display_name: string; avatar_url: string | null } | null;
}

/**
 * listActivityParticipants 和 listActivityParticipantPreviews 共用的行
 * 映射——两处联表结构完全一样（`user_id` + `user:profiles(display_name,
 * avatar_url)`），只是后者多一列 `activity_id` 用来分组，映射成
 * ActivityParticipant 的逻辑没有理由抄两遍。
 */
function mapActivityParticipantRow(row: ActivityParticipantRow): ActivityParticipant {
  return {
    userId: row.user_id,
    displayName: row.user?.display_name ?? "未知用户",
    avatarUrl: row.user?.avatar_url ?? null
  };
}

/**
 * 活动详情页"参与者"区块用（设计文档第 4 节 + 本批任务范围 1）。这里不做
 * 任何"我有没有权限看"的判断——RLS 已经按身份把可见范围收窄好了：
 * activity_participants_select_organizer 让发起人查到完整名单，
 * activity_participants_select_joined 让当前仍报名的用户查到"互相可见"的
 * 名单，两条都不满足时（路人、或者已经退出的用户查看别人的行）一行都
 * 查不到。这里只负责查询和字段映射，调用方（activity-detail-page.tsx）
 * 按"查到就展示、空数组就不展示这个区块，保留原有的汇总人数"处理，不在
 * 前端重复造一套权限判断。
 *
 * `.is("cancelled_at", null)` 这个过滤是内容口径，不是权限判断：
 * activity_participants_select_joined 只负责"你有没有资格看这张活动下的
 * 参与者行"，不负责"这一行本身要不要出现在名单里"——已经退出的历史记录
 * 不应该出现在"参与者"名单里，这跟 participant_count 触发器只统计未取消
 * 的人是同一个口径。
 *
 * `.eq("status", "approved")` 是这次头像堆叠改版顺手修的一个独立 bug：
 * P2 报名审核制上线后，一条 activity_participants 行可能是 pending/
 * approved/rejected 三种 status 中的任意一种，但这里之前只按
 * cancelled_at 过滤，没有排除 pending/rejected——一个还在等发起人处理的
 * 申请，会被这个函数当成"已确认参与者"返回，跟头像堆叠/参与者列表想展示
 * 的"已经在活动里的人"不是一回事，也跟 participant_count 的口径不一致
 * （sync_activity_participant_count() 触发器只统计
 * status = 'approved' and cancelled_at is null 的行，见迁移文件
 * 20260816175611_activity_join_approval.sql）。加上这条过滤后两者口径
 * 才是一致的。
 *
 * 联表多选一列 avatar_url——头像堆叠（ActivityParticipantAvatars）需要
 * 展示参与者的头像，跟 display_name 是同一张 profiles 表、同一次联表，
 * 不需要额外查询。
 */
export async function listActivityParticipants(
  activityId: string
): Promise<ActivityParticipant[]> {
  const { data, error } = await getSupabaseClient()
    .from("activity_participants")
    .select("user_id, user:profiles(display_name, avatar_url)")
    .eq("activity_id", activityId)
    .eq("status", "approved")
    .is("cancelled_at", null)
    .order("joined_at", { ascending: true })
    .overrideTypes<ActivityParticipantRow[]>();

  if (error) {
    throw new AppError(error.message, "ACTIVITY_PARTICIPANTS_LIST_FAILED", error);
  }

  return (data ?? []).map(mapActivityParticipantRow);
}

interface ActivityParticipantPreviewRow extends ActivityParticipantRow {
  activity_id: string;
}

/**
 * 活动列表页（Meet5 风格单栏卡片）用：一次性批量查出多张活动各自的参与者
 * 预览，按 activityId 分组成 Map，供每张卡片的 ActivityParticipantAvatars
 * 渲染头像堆叠——跟 listPendingActivityParticipants 是同一个"一次
 * .in("activity_id", activityIds) 批量查询，按 activityId 分组"模式，
 * 避免列表页对每张卡片各发一次参与者查询（N+1）。查询条件（已确认参与者、
 * 未取消）和行映射直接复用 listActivityParticipants 的口径
 * （mapActivityParticipantRow），保证列表卡片头像堆叠和详情页头像堆叠
 * 看到的是同一批人。
 *
 * 不做"每个活动最多返回几条"的数据库层限制——PostgREST 没有"按分组各取
 * 前 N 条"的简单写法，交给调用方（ActivityParticipantAvatars 内部固定的
 * "最多 8 个视觉位置"规则，见该组件顶部注释）在展示层截断。这跟目前活动/
 * 参与者的规模（个位数到几十）完全匹配，不是性能问题；活动或参与者量级
 * 变大之后如果需要数据库层分页/限制，是另一个话题，这次不做。
 *
 * activityIds 为空数组时直接返回空 Map，不发请求，跟
 * listPendingActivityParticipants 的空数组早退是同一个原则。
 */
export async function listActivityParticipantPreviews(
  activityIds: string[]
): Promise<Map<string, ActivityParticipant[]>> {
  if (activityIds.length === 0) {
    return new Map();
  }

  const { data, error } = await getSupabaseClient()
    .from("activity_participants")
    .select("activity_id, user_id, user:profiles(display_name, avatar_url)")
    .in("activity_id", activityIds)
    .eq("status", "approved")
    .is("cancelled_at", null)
    .order("joined_at", { ascending: true })
    .overrideTypes<ActivityParticipantPreviewRow[]>();

  if (error) {
    throw new AppError(error.message, "ACTIVITY_PARTICIPANT_PREVIEWS_LIST_FAILED", error);
  }

  const previewsByActivity = new Map<string, ActivityParticipant[]>();
  for (const row of data ?? []) {
    const participant = mapActivityParticipantRow(row);
    const existing = previewsByActivity.get(row.activity_id);
    if (existing) {
      existing.push(participant);
    } else {
      previewsByActivity.set(row.activity_id, [participant]);
    }
  }
  return previewsByActivity;
}

export interface MyJoinedActivityItem extends ActivityListItem {
  /** 这次报名/申请本身的状态（不是活动的 status）——pending 时前端要
   *  展示"申请中，等待发起人同意"，跟活动本身被取消是两件独立的事。
   *  rejected 不会出现在这里，见下面 listMyJoinedActivities 的过滤说明。 */
  participationStatus: "pending" | "approved";
}

interface MyJoinedActivityRow {
  activity: ActivityListRow | null;
  status: string;
}

/**
 * "我的活动"页面"我报名的" tab 用：当前用户当前仍报名/申请中
 * （cancelled_at is null）的活动，包括活动之后被发起人取消的情况——这正是
 * 新增的 activities_select_participant 这条 RLS（见迁移文件
 * supabase/migrations/20260816172621_add_activities_select_participant_policy.sql）
 * 要解决的问题：只按 activity_participants 表过滤"我是不是还报名着"，
 * 活动本身的 status/deleted_at 完全不影响这里能不能查到，交给这条新策略
 * 兜底，这一层不重复判断。
 *
 * P2 报名审核制上线后加了一条 `.neq("status", "rejected")` 过滤——status
 * 列出现之前，"cancelled_at is null"就等于"还算报名中"；现在一条被发起人
 * 拒绝的申请，cancelled_at 依然是 null（拒绝不会碰 cancelled_at，只改
 * status），如果不过滤掉，会在这个列表里显示成一张跟正常已报名活动没有
 * 区别的卡片、还带着一个能点的"退出"按钮，这是明显错的——一条已经被拒绝
 * 的申请不应该出现在"我报名的"里，用户应该去详情页看到"申请已被拒绝"这个
 * 明确的结论，不是在管理列表里假装自己还报名着。pending 的申请仍然保留
 * 在这个列表里（用 participationStatus 字段标出来，卡片上加一行"申请中"
 * 提示），因为撤回一条待处理的申请（点"退出"）依然是一个有意义的操作。
 *
 * 从 activity_participants 出发、内嵌 activities（多对一关系，PostgREST
 * 按外键返回单个对象而不是数组），而不是反过来从 activities 查——这是这个
 * tab 的过滤条件（"我当前报名的记录"）天然长在 activity_participants 表上，
 * 从这张表出发不需要先查一遍参与记录再拿 id 去 activities 表 in()，一次
 * 查询就够。activity 为 null 的行理论上不应该出现（新策略已经保证只要有
 * 参与记录就能读到活动本身），但仍然过滤掉、不让页面因为一条意外的 null
 * 崩掉——跟这个仓库其它"联表可能为 null"的防御性写法一致。
 *
 * 按 joined_at 降序（最近报名的排最前面）——这是参与记录本身自带的、
 * 意义明确的时间字段，不需要像 listMyOrganizedActivities 那样在"用什么
 * 排序"上纠结。
 */
export async function listMyJoinedActivities(userId: string): Promise<MyJoinedActivityItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("activity_participants")
    .select(`status, activity:activities(${ACTIVITY_LIST_SELECT_COLUMNS})`)
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .neq("status", "rejected")
    .order("joined_at", { ascending: false })
    .overrideTypes<MyJoinedActivityRow[]>();

  if (error) {
    throw new AppError(error.message, "MY_JOINED_ACTIVITIES_LIST_FAILED", error);
  }

  return (data ?? [])
    .filter(
      (row): row is { activity: ActivityListRow; status: string } => row.activity !== null
    )
    .map((row) => ({
      ...mapActivityListRow(row.activity),
      participationStatus: row.status as "pending" | "approved"
    }));
}

/**
 * 退出活动：软删除（把 cancelled_at 设成当前时间），不做真正的 DELETE，
 * 见设计文档 3.2 节。UPDATE 即使被 RLS 过滤掉 0 行也不会报错，照抄这个
 * 仓库反复用到的防御写法（comments-repository.ts 的 softDeleteComment、
 * posts-repository.ts 那几个作者自助操作方法）：UPDATE 后面接
 * .select("id").maybeSingle() 确认真的改到了一行，没改到就当成失败。
 * `.is("cancelled_at", null)` 这个过滤条件顺带避免了"对一条已经是退出
 * 状态的行再退出一次"这种无意义的 UPDATE（虽然即使执行了也无害，触发器
 * 那边 delta 判断 old/new 的 cancelled_at 变化，重复退出不会导致
 * participant_count 被多减一次，但没必要真的发这次请求）。
 */
export async function leaveActivity(activityId: string, userId: string): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from("activity_participants")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("activity_id", activityId)
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "ACTIVITY_LEAVE_FAILED", error);
  }
  if (!data) {
    throw new AppError(ACTIVITY_LEAVE_NOT_FOUND_MESSAGE, "ACTIVITY_LEAVE_NOT_FOUND");
  }
}

const ACTIVITY_NOT_FOUND_OR_FORBIDDEN_MESSAGE = "活动不存在，或没有权限操作。";

/**
 * 发起人取消自己的活动（"我的活动"页面"取消活动"操作）：把 status 改成
 * 'cancelled'。activities_update_own 这条 RLS（`organizer_id = auth.uid()`）
 * 早就允许发起人自己改 status，不需要新权限，也不在这里重复校验
 * "当前 status 是不是 open/full"——UI 层（my-activities-page.tsx）只在
 * status 是 open/full 时才展示这个操作入口，已经把"已取消/已结束的活动
 * 不该再被取消"这条规则挡住了，这里直接照抄 posts-repository.ts 的
 * archivePost 那套最简单的"UPDATE + select(id).maybeSingle() 确认改到了
 * 一行"写法，不需要在数据库这一层再加一层状态前置条件判断。
 *
 * 不做"同时通知所有参与者"——这次任务范围只是"发起人能取消"，通知参与者
 * 是完全独立的另一个功能（需要遍历所有参与者、决定通知内容/渠道等一整套
 * 设计），任务卡没有要求，不顺带做。
 */
export async function cancelActivity(activityId: string): Promise<void> {
  const payload: TablesUpdate<"activities"> = { status: "cancelled" };

  const { data, error } = await getSupabaseClient()
    .from("activities")
    .update(payload)
    .eq("id", activityId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "ACTIVITY_CANCEL_FAILED", error);
  }
  if (!data) {
    throw new AppError(ACTIVITY_NOT_FOUND_OR_FORBIDDEN_MESSAGE, "ACTIVITY_CANCEL_NOT_FOUND");
  }
}

export interface PendingActivityParticipant {
  participantId: string;
  activityId: string;
  userId: string;
  displayName: string;
}

interface PendingActivityParticipantRow {
  id: string;
  activity_id: string;
  user_id: string;
  user: { display_name: string } | null;
}

/**
 * "我的活动"页面"我发起的" tab 用：一次性查出多场活动（同一个发起人的
 * 全部 requires_approval = true 的活动）下所有待处理的申请，不是"每张卡片
 * 单独发一次请求"——批一次查，用 activityId 字段在页面里按活动分组，
 * 避免 N+1（这个仓库目前没有其它地方需要这种"批量查多个父资源各自的子
 * 列表"场景，这里选择"传一批 id 进来，一条 .in() 查询"这个最直接的做法，
 * 不是过度设计）。
 *
 * activity_participants_select_organizer 这条 RLS（`exists (select 1 from
 * activities a where a.id = activity_participants.activity_id and
 * a.organizer_id = auth.uid())`）保证只会查到调用者自己发起的活动下的
 * 参与者行，即使调用方不小心传了别人的活动 id 进来，也只是查不到那部分
 * 数据，不会越权读到别的发起人的申请。
 */
export async function listPendingActivityParticipants(
  activityIds: string[]
): Promise<PendingActivityParticipant[]> {
  if (activityIds.length === 0) {
    return [];
  }

  const { data, error } = await getSupabaseClient()
    .from("activity_participants")
    .select("id, activity_id, user_id, user:profiles(display_name)")
    .in("activity_id", activityIds)
    .eq("status", "pending")
    .order("joined_at", { ascending: true })
    .overrideTypes<PendingActivityParticipantRow[]>();

  if (error) {
    throw new AppError(error.message, "ACTIVITY_PENDING_PARTICIPANTS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    participantId: row.id,
    activityId: row.activity_id,
    userId: row.user_id,
    displayName: row.user?.display_name ?? "未知用户"
  }));
}

/**
 * 发起人同意一条报名申请：把 activity_participants.status 从 'pending'
 * 改成 'approved'。这一列客户端不能直接 UPDATE（`revoke update (status)`，
 * 见迁移文件 20260816175611_activity_join_approval.sql），只能走这个
 * security definer 函数——函数内部会校验调用者是不是这场活动的发起人、
 * 这条记录当前是不是 pending，两个条件都不满足会抛异常，这里不重复校验，
 * 直接把数据库的失败原因包装成 AppError。
 *
 * approve/reject 都不区分"是不是 pending"这类具体失败原因，统一用一条
 * 通用错误码——跟 cancelActivity 的错误处理力度一致：这两个函数是这批
 * 任务新增的、还没有别的地方需要更细的错误分支，等真的需要再细化。
 */
export async function approveActivityParticipant(participantId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("approve_activity_participant", {
    target_participant_id: participantId
  });

  if (error) {
    throw new AppError(error.message, "ACTIVITY_PARTICIPANT_APPROVE_FAILED", error);
  }
}

/**
 * 发起人拒绝一条报名申请：把 status 改成 'rejected'。同上，只能走
 * security definer 函数，不能直接 UPDATE。
 */
export async function rejectActivityParticipant(participantId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("reject_activity_participant", {
    target_participant_id: participantId
  });

  if (error) {
    throw new AppError(error.message, "ACTIVITY_PARTICIPANT_REJECT_FAILED", error);
  }
}

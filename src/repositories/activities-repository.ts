import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
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
}

export interface ListActivitiesInput {
  channel?: string;
  locationId?: string;
}

interface ActivityListRow {
  id: string;
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
 * channel/locationId 两个筛选都是可选的精确匹配（不是像 posts 搜索那样
 * 的模糊匹配），city 筛选就是"同城市"这个产品要求本身（见设计文档第 5
 * 节问题 2：不做真实地理距离，复用 locations 表的城市粒度）。
 */
export async function listActivities(
  input: ListActivitiesInput = {}
): Promise<ActivityListItem[]> {
  const nowIso = new Date().toISOString();

  let query = getSupabaseClient()
    .from("activities")
    .select(
      "id, channel, tag_text, title, location:locations(name), landmark_text, is_online, start_at, capacity, participant_count, status"
    )
    .in("status", ["open", "full"])
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true });

  if (input.channel) {
    query = query.eq("channel", input.channel);
  }
  if (input.locationId) {
    query = query.eq("location_id", input.locationId);
  }

  const { data, error } = await query.overrideTypes<ActivityListRow[]>();

  if (error) {
    throw new AppError(error.message, "ACTIVITIES_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    channel: row.channel,
    tagText: row.tag_text,
    title: row.title,
    locationName: row.location?.name ?? null,
    landmarkText: row.landmark_text,
    isOnline: row.is_online,
    startAt: row.start_at,
    capacity: row.capacity,
    participantCount: row.participant_count,
    status: row.status
  }));
}

export interface ActivityDetail {
  id: string;
  organizerId: string;
  organizerDisplayName: string;
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
  location: { name: string } | null;
  organizer: { display_name: string } | null;
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
      "id, organizer_id, channel, tag_text, title, description, location_id, landmark_text, is_online, start_at, capacity, participant_count, contact_method, contact_value, status, location:locations(name), organizer:profiles(display_name)"
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
    status: data.status
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
    contact_value: input.contactValue
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

/**
 * 判断当前用户是否"正在报名"这场活动（用来决定详情页按钮显示"报名"还是
 * "退出"）。查不到行时统一当成"未报名"处理，不区分"从来没报名过"和
 * "报名过又退出了"——activity_participants_select_joined 这条 RLS 策略
 * 要求"自己当前有一条 cancelled_at is null 的记录"才能 select 到这场
 * 活动下的任何行，退出之后连自己那条已取消的记录都查不到了，应用层本来
 * 就没有能力区分这两种情况，也没有必要区分：按钮只需要知道"现在是不是
 * 报名状态"，不需要知道"历史上有没有报名过"。
 */
export async function isCurrentlyJoined(activityId: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from("activity_participants")
    .select("id")
    .eq("activity_id", activityId)
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "ACTIVITY_PARTICIPATION_CHECK_FAILED", error);
  }

  return data !== null;
}

const UNIQUE_VIOLATION_CODE = "23505";
const ACTIVITY_JOIN_FORBIDDEN_MESSAGE = "报名失败，这个活动可能已满员或已结束，请刷新后重试。";
const ACTIVITY_LEAVE_NOT_FOUND_MESSAGE = "你还没有报名这个活动，或者已经退出了。";

/**
 * 报名一个活动。设计文档 3.2 节："退出后重新报名靠把 cancelled_at 置回
 * null（应用层 upsert 逻辑），不插入新行"——但这个"先查一下有没有旧行"
 * 的直觉写法在这里行不通：activity_participants_select_joined 这条 RLS
 * 策略要求"自己当前有一条 cancelled_at is null 的记录"才能 select 到这场
 * 活动下的任何行，一个刚退出的用户此时恰好没有这样一条记录，所以退出后
 * 他自己那条已取消的历史记录对他自己来说也是不可见的——先 select 判断
 * "是不是已经报名过"这一步在这个场景下永远查不到东西，没法用来分支。
 *
 * 所以这里反过来：先直接尝试 insert，让 unique(activity_id, user_id)
 * 这条唯一约束替我们判断"是不是已经有一行了"——插入成功就是第一次报名；
 * 撞上 23505 唯一冲突，说明那一行还在（大概率是之前报名又退出留下的
 * cancelled_at 不为 null 的记录，也可能是另一个标签页并发插入），再补一次
 * UPDATE 把 cancelled_at 置回 null，这才是真正的"重新报名"分支。
 */
export async function joinActivity(activityId: string, userId: string): Promise<void> {
  const payload: TablesInsert<"activity_participants"> = {
    activity_id: activityId,
    user_id: userId
  };

  const { error: insertError } = await getSupabaseClient()
    .from("activity_participants")
    .insert(payload);

  if (!insertError) {
    return;
  }

  if (insertError.code === UNIQUE_VIOLATION_CODE) {
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
    // activity_participants_insert_own 的 with check 有三个独立条件
    // （账号未受限、user_id = auth.uid()、活动 status = 'open'），42501
    // 分不清具体是哪一个——跟 comments-repository.ts 的 createComment 是
    // 同一个情况："活动已满员/已结束"是真实会在正常使用中触发的场景
    // （比如两个人同时点最后一个名额），不能像 createActivity 那样简单
    // 归因于账号受限，统一包装成一条通用失败提示。
    throw new AppError(ACTIVITY_JOIN_FORBIDDEN_MESSAGE, "ACTIVITY_JOIN_FORBIDDEN", insertError);
  }

  throw new AppError(insertError.message, "ACTIVITY_JOIN_FAILED", insertError);
}

export interface ActivityParticipant {
  userId: string;
  displayName: string;
}

interface ActivityParticipantRow {
  user_id: string;
  user: { display_name: string } | null;
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
 */
export async function listActivityParticipants(
  activityId: string
): Promise<ActivityParticipant[]> {
  const { data, error } = await getSupabaseClient()
    .from("activity_participants")
    .select("user_id, user:profiles(display_name)")
    .eq("activity_id", activityId)
    .is("cancelled_at", null)
    .order("joined_at", { ascending: true })
    .overrideTypes<ActivityParticipantRow[]>();

  if (error) {
    throw new AppError(error.message, "ACTIVITY_PARTICIPANTS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    displayName: row.user?.display_name ?? "未知用户"
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

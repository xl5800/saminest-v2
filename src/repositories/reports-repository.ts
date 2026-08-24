import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

// Postgres/PostgREST 的 unique_violation 错误码，对应 reports 表的
// reports_reporter_active_target_unique_idx 部分唯一索引（见
// supabase/migrations/20260716000300_create_reports_table.sql）。
const UNIQUE_VIOLATION_CODE = "23505";

// Postgres/PostgREST 的 insufficient_privilege 错误码，任何 RLS with check
// 失败都会报这个码——具体为什么这里能把它安全地归因于账号受限，见下面
// createReport 里的注释。
const RLS_VIOLATION_CODE = "42501";
const ACCOUNT_RESTRICTED_MESSAGE =
  "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。";

/**
 * 举报原因可选值，对应 reports 表 reason_code 的 check 约束（迁移文件
 * reports_reason_code_check），中文文案供表单展示用。
 */
export const REPORT_REASON_OPTIONS = [
  { value: "scam", label: "诈骗" },
  { value: "spam", label: "广告/垃圾信息" },
  { value: "duplicate", label: "重复发布" },
  { value: "illegal_content", label: "违规内容" },
  { value: "misleading", label: "虚假/误导信息" },
  { value: "harassment", label: "骚扰" },
  { value: "privacy", label: "侵犯隐私" },
  { value: "other", label: "其他" }
] as const;

export type ReportReasonCode = (typeof REPORT_REASON_OPTIONS)[number]["value"];

export interface CreateReportInput {
  reporterId: string;
  targetType: "post" | "comment" | "activity" | "user";
  targetId: string;
  reasonCode: string;
  description: string | null;
}

export interface CreateReportResult {
  id: string;
}

/**
 * 提交一条举报。
 *
 * reports_reporter_active_target_unique_idx 部分唯一索引保证同一用户对同一
 * (target_type, target_id) 最多只能有一条非终结状态（pending/reviewing）的
 * 举报。撞上这个约束（错误码 23505）说明用户已经举报过且还在处理中——这里
 * 不像 favorites 的重复收藏那样当成"静默成功"，而是转换成一个专门的
 * AppError（code: REPORT_DUPLICATE），让调用方能展示"您已经举报过"这样明确
 * 的提示，而不是把原始数据库错误抛给用户。
 */
export async function createReport(
  input: CreateReportInput
): Promise<CreateReportResult> {
  const payload: TablesInsert<"reports"> = {
    reporter_id: input.reporterId,
    target_type: input.targetType,
    target_id: input.targetId,
    reason_code: input.reasonCode,
    description: input.description
  };

  const { data, error } = await getSupabaseClient()
    .from("reports")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      throw new AppError(
        "您已经举报过这条内容，正在处理中，请勿重复提交。",
        "REPORT_DUPLICATE",
        error
      );
    }
    // reports_insert_own 这条 RLS 策略（见
    // supabase/migrations/20260717000700_account_status_enforcement.sql）的
    // with check 有两个条件：reporter_id = auth.uid()，以及
    // not is_account_restricted()。42501 是 PostgREST 对"任意 with check
    // 失败"统一返回的错误码，本身分不清是哪个条件失败——但这里的
    // reporter_id 只可能来自 input.reporterId，而 createReport 唯一的
    // 调用方 report-post-page.tsx 只会传当前登录用户自己的
    // session.user.id，不接受任意/伪造输入，所以 reporter_id 这个条件对
    // 一个正常工作的客户端来说永远成立。因此对这个调用点而言，42501
    // 只可能是 is_account_restricted() 失败，可以放心地映射成一条专门的、
    // 可操作的提示，而不是把原始的"违反行级安全策略"报给用户。
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
    throw new AppError(error.message, "REPORT_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError("提交举报后无法读取举报 ID。", "REPORT_CREATE_ID_MISSING");
  }

  return { id: data.id };
}

/**
 * 被举报评论的完整上下文——UGC 安全功能补齐任务卡 3：管理员需要在举报行
 * 内直接看到评论原文，不用跳出这个页面自己拿 target_id 去数据库查。
 * isDeleted 为 true 时（用户已经自助软删除这条评论）content 仍然是原文，
 * 不是占位文字——评论表是软删除（deleted_at），content 字段原样留在
 * 数据库里，"用户删了不代表举报可以不处理"，管理员需要看到原始内容才能
 * 判断要不要顺带处置这个账号，具体设计取舍见
 * docs/04_Development/Apple-UGC-Compliance-Review.md 第六节（含"为什么不
 * 需要额外做举报时的内容快照"的完整论证——评论软删除 + 无编辑功能，天然
 * 达到别的平台需要额外建快照表才能达到的效果）。postTitle 找不到时（比如
 * 帖子查询失败）回退成 null，调用方用 postId 兜底展示链接文案，不是需要
 * 报错中断整个列表的情况。
 */
export interface CommentPreview {
  content: string;
  isDeleted: boolean;
  authorDisplayName: string;
  postId: string;
  postTitle: string | null;
}

export interface AdminReportListItem {
  id: string;
  reasonCode: string;
  description: string | null;
  createdAt: string;
  targetType: string;
  targetId: string;
  /** 被举报内容的标题（帖子/活动）或被举报用户的昵称（target_type 为
   *  "user" 时），仅用于列表展示，找不到时（比如 target_type 是
   *  comment，或查询失败）回退成 null，调用方用 targetId 兜底，不是一个
   *  需要报错中断整个列表的情况——见 fetchTargetTitles 的注释。字段名
   *  沿用 targetTitle 没有为"用户昵称"这个场景单独加一个字段，跟调用方
   *  （reports-page.tsx）"不管 target_type 具体是什么，这一列展示的都是
   *  被举报对象的一个简短标识"这个统一渲染逻辑保持一致。target_type 为
   *  "comment" 时这个字段固定是 null——评论的展示信息量比一个标题大得多
   *  （原文/作者/是否已删除/所属帖子），单独放进下面的 commentPreview，
   *  不硬塞进这个只适合"一句话标题"的字段。 */
  targetTitle: string | null;
  /** target_type 为 "comment" 时的评论原文及上下文，其它 target_type
   *  恒为 null。见上面 CommentPreview 的注释。 */
  commentPreview: CommentPreview | null;
  reporterName: string;
}

interface AdminReportRow {
  id: string;
  reason_code: string;
  description: string | null;
  created_at: string;
  target_type: string;
  target_id: string;
  reporter: { display_name: string } | null;
}

interface CommentPreviewRow {
  id: string;
  content: string;
  deleted_at: string | null;
  post_id: string;
  author: { display_name: string } | null;
  post: { title: string } | null;
}

interface FetchTargetTitlesResult {
  titles: Map<string, string>;
  commentPreviews: Map<string, CommentPreview>;
}

/**
 * reports.target_id 是多态引用——同一列根据 target_type 指向 posts /
 * activities / profiles / comments 的 id，数据库层面没有（也不可能有）
 * 外键约束，PostgREST 没法用嵌套 select 一次性把标题/内容带出来。这里
 * 按 target_type 分组，各自去对应的表批量查一次，再在内存里拼回去，跟
 * 外键 join 效果等价，只是分开查询。
 *
 * posts_select_public_or_own_or_admin、activities_select_admin 这两条
 * RLS 策略都对管理员整表放行，不受 status/deleted_at 限制；
 * comments_select_of_approved_or_own_posts 这次任务补上了 is_admin() 例外
 * （见 supabase/migrations/20260823020000_comments_select_admin_exception.sql），
 * 管理员现在同样不受"帖子是否已审核公开"限制。profiles_select_public_or_self
 * 同理对被举报账号是否已经受限/封禁不敏感（这条 RLS 只按 deleted_at 过滤，
 * 账号状态变化不影响能不能查到这一行）。这几个查询因此都不用额外处理
 * "帖子已下架/评论所属帖子还在待审核/活动已取消"这类情况——管理员本来就
 * 应该能看到。
 *
 * 标题/评论内容只是列表展示的辅助信息，这里查询失败不应该让整个举报列表
 * 加载失败——跟 use-toggle-activity-participation-mutation.ts 里
 * notifyOrganizer 失败只 console.error、不影响报名/退出本身成功判定是
 * 同一个"核心数据与辅助信息分开判定成败"的原则，查不到就让调用方用
 * targetId 兜底展示。
 *
 * 其它未来可能出现的 target_type 直接跳过，不去查任何表。
 */
async function fetchTargetTitles(rows: AdminReportRow[]): Promise<FetchTargetTitlesResult> {
  const titles = new Map<string, string>();
  const commentPreviews = new Map<string, CommentPreview>();
  const postIds = rows.filter((row) => row.target_type === "post").map((row) => row.target_id);
  const activityIds = rows
    .filter((row) => row.target_type === "activity")
    .map((row) => row.target_id);
  const userIds = rows.filter((row) => row.target_type === "user").map((row) => row.target_id);
  const commentIds = rows
    .filter((row) => row.target_type === "comment")
    .map((row) => row.target_id);

  if (
    postIds.length === 0 &&
    activityIds.length === 0 &&
    userIds.length === 0 &&
    commentIds.length === 0
  ) {
    return { titles, commentPreviews };
  }

  const client = getSupabaseClient();

  try {
    if (postIds.length > 0) {
      const { data, error } = await client.from("posts").select("id, title").in("id", postIds);
      if (error) throw error;
      for (const post of data ?? []) {
        titles.set(`post:${post.id}`, post.title);
      }
    }

    if (activityIds.length > 0) {
      const { data, error } = await client
        .from("activities")
        .select("id, title")
        .in("id", activityIds);
      if (error) throw error;
      for (const activity of data ?? []) {
        titles.set(`activity:${activity.id}`, activity.title);
      }
    }

    if (userIds.length > 0) {
      const { data, error } = await client
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      if (error) throw error;
      for (const profile of data ?? []) {
        titles.set(`user:${profile.id}`, profile.display_name);
      }
    }

    if (commentIds.length > 0) {
      // author:profiles(display_name) / post:posts(title) 都只对应
      // comments 表上唯一的一个外键（user_id / post_id），不会像 reports
      // 表对 profiles 有两个外键（reporter_id/reviewer_id）那样触发
      // PGRST201 关系消歧错误，不需要 `profiles!comments_user_id_fkey(...)`
      // 这种显式写法——跟 comments-repository.ts 的 listPostComments()
      // 是同一个结论。
      const { data, error } = await client
        .from("comments")
        .select("id, content, deleted_at, post_id, author:profiles(display_name), post:posts(title)")
        .in("id", commentIds)
        .overrideTypes<CommentPreviewRow[]>();
      if (error) throw error;
      for (const comment of data ?? []) {
        commentPreviews.set(`comment:${comment.id}`, {
          content: comment.content,
          isDeleted: comment.deleted_at !== null,
          authorDisplayName: comment.author?.display_name ?? "未知用户",
          postId: comment.post_id,
          postTitle: comment.post?.title ?? null
        });
      }
    }
  } catch (titleLookupError) {
    console.error("举报目标标题/评论内容查询失败：", titleLookupError);
  }

  return { titles, commentPreviews };
}

/**
 * 管理员举报处理队列用。跟公开的举报提交流程刻意不向任何人（包括被举报的
 * 帖子作者）展示举报人身份不同，这是内部管理后台，管理员需要知道是谁提交
 * 的举报（判断是否恶意举报、是否需要联系举报人等），所以用嵌套 select 把
 * profiles.display_name（通过 reporter_id）一并带出来。
 *
 * status 支持按参数过滤（"如果这部分复杂就先只做 pending 列表"——实际实现
 * 起来只是多一个 .eq("status", status)，成本很低，所以没有省略，默认值是
 * "pending"，跟 reports_status_check 约束里的四个取值一致）。
 *
 * reports 表对 profiles 有两个外键（reporter_id 和 reviewer_id），嵌套
 * select 写 `profiles(display_name)` 时 PostgREST 分不清该走哪个外键，
 * 会直接报错（PGRST201: more than one relationship was found），必须显式
 * 用 `profiles!reports_reporter_id_fkey(display_name)` 指定走哪一个——
 * 这个坑在真实浏览器验证时才会暴露（vitest 里 Supabase 客户端是 mock 的，
 * 不会真的触发 PostgREST 的关系消歧逻辑）。
 */
export async function listReportsForModeration(
  status: string = "pending"
): Promise<AdminReportListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("reports")
    .select(
      "id, reason_code, description, created_at, target_type, target_id, reporter:profiles!reports_reporter_id_fkey(display_name)"
    )
    .eq("status", status)
    .order("created_at", { ascending: true })
    .overrideTypes<AdminReportRow[]>();

  if (error) {
    throw new AppError(error.message, "ADMIN_REPORTS_LIST_FAILED", error);
  }

  const rows = data ?? [];
  const { titles, commentPreviews } = await fetchTargetTitles(rows);

  return rows.map((row) => ({
    id: row.id,
    reasonCode: row.reason_code,
    description: row.description,
    createdAt: row.created_at,
    targetType: row.target_type,
    targetId: row.target_id,
    targetTitle: titles.get(`${row.target_type}:${row.target_id}`) ?? null,
    commentPreview: commentPreviews.get(`${row.target_type}:${row.target_id}`) ?? null,
    reporterName: row.reporter?.display_name ?? "未知用户"
  }));
}

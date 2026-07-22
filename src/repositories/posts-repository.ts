import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "../types/database.generated";
import { AppError } from "../utils/app-error";

export interface PostListItem {
  id: string;
  title: string;
  priceAmount: number | null;
  priceLabel: string | null;
  currencyCode: string;
  locationName: string | null;
  createdAt: string;
}

// 卡片瀑布流首页/分类页用的扩展形状，在 PostListItem 基础上多带分类名、
// 发布者昵称、封面图、收藏数——特意不直接扩宽 PostListItem 本身，因为
// favorites-repository.ts 的 listFavoritedPosts（/favorites 收藏列表页用）
// 复用的正是 PostListItem 这个类型，如果在这里加字段，会强迫收藏列表页
// 也去查/映射这些跟它无关的字段。两个功能读的字段集合本来就不一样
// （收藏列表目前不需要分类/作者/封面图/收藏数），拆成两个类型能让
// listApprovedPosts 和 listFavoritedPosts 继续互不影响地演进。
export interface PostFeedItem extends PostListItem {
  categoryName: string;
  authorDisplayName: string;
  coverImageUrl: string | null;
  favoriteCount: number;
}

export interface ListApprovedPostsInput {
  categoryId?: string;
  searchQuery?: string;
  page: number;
  pageSize: number;
}

export interface ListApprovedPostsResult {
  posts: PostFeedItem[];
  hasNextPage: boolean;
}

interface PostFeedImageRow {
  public_url: string | null;
  sort_order: number;
  deleted_at: string | null;
}

interface PostFeedRow {
  id: string;
  title: string;
  price_amount: number | null;
  price_label: string | null;
  currency_code: string;
  created_at: string;
  favorite_count: number;
  location: { name: string } | null;
  location_text: string | null;
  category: { name_zh: string } | null;
  author: { display_name: string } | null;
  post_images: PostFeedImageRow[] | null;
}

/**
 * 地区展示名：优先用标准化地区（location_id 联表出来的 name），
 * 没有的话退回作者发布/编辑时手动填的 location_text（"其他"选项，见
 * supabase/migrations/20260722000400_add_posts_location_text.sql），
 * 两者都没有才是真的"不限地区"。四处需要展示地区名的查询
 * （listApprovedPosts / getPostDetail / listMyPosts / listFavoritedPosts）
 * 共用这一个函数，避免同一个 fallback 逻辑写四遍。
 */
export function resolveLocationName(
  location: { name: string } | null,
  locationText: string | null
): string | null {
  return location?.name ?? locationText ?? null;
}

/**
 * post_images 这里用 `.order(..., { foreignTable: "post_images" })` +
 * `.limit(1, { foreignTable: "post_images" })` 把每个帖子最多带出一条
 * （按 sort_order 最小，即封面图）内嵌图片行，避免 N+1；但 supabase-js
 * 这种嵌套 select 语法本身没有再加一个只作用于 post_images 这张内嵌表的
 * `.eq("deleted_at", null)`（那个 `.eq`/`.is` 会作用在外层 posts 查询上），
 * 所以这里跟 favorites-repository.ts 的 listFavoritedPosts 处理
 * posts.deleted_at 一样，多选出 deleted_at 这一列，在 JS 里判断：这一条
 * 内嵌图片如果已被软删除，封面图当作不存在处理，而不是把已软删除的图片
 * 展示出来。
 */
function resolveCoverImageUrl(images: PostFeedImageRow[] | null): string | null {
  const cover = images?.[0];
  if (!cover || cover.deleted_at !== null) {
    return null;
  }
  return cover.public_url;
}

/**
 * 首页/分类页搜索框传进来的原始用户输入，在拼进 PostgREST 的
 * `.or("title.ilike.%xxx%,description.ilike.%xxx%")` 过滤字符串之前，必须
 * 先经过这道清洗，原因有两个、彼此独立：
 *
 * 1. PostgREST 的 `or=(...)` 过滤字符串语法把 `,`、`(`、`)` 当成有语法意义
 *    的分隔符/分组符——用户搜索词里如果原样带着这几个字符，会把过滤表达式
 *    拼坏（不是 SQL 注入风险，PostgREST 执行阶段仍然是参数化查询，但过滤
 *    条件本身会被解析错，可能报错也可能匹配到完全不是用户想要的结果）。
 *    这几个字符对这个应用的搜索场景也没什么有意义的内容（不是短语搜索
 *    语法），直接整个丢弃，不需要转义保留。
 * 2. `%` 和 `_` 是 ILIKE 的通配符——用户如果就是想搜一个字面的 `%` 或 `_`
 *    （比如帖子标题里真的带百分号），不转义的话会被当成通配符语义，
 *    匹配到用户没打算匹配的内容。这里反斜杠转义成字面字符。
 *
 * 转义顺序有讲究：先转义 `\` 本身，再转义 `%`/`_`，避免把这一步新加出来的
 * 转义反斜杠自己又被后面的规则再转义一遍（双重转义）。
 *
 * 清洗完如果是空字符串（原始输入整个是空白，或者整个只由 `,()` 组成），
 * 调用方视为"没有搜索词"，不施加这个过滤条件——而不是拼一个空的
 * `ilike.%%` 条件（那等价于"随便什么都匹配"，语义上没问题但没必要）。
 */
function sanitizeSearchTerm(raw: string): string {
  return raw
    .trim()
    .replace(/[,()]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * 只返回 status = 'approved' 且未软删除的帖子，游客和登录用户看到的列表一致。
 * 用多取一条（pageSize + 1）判断是否有下一页，不额外发 COUNT(*) 查询，
 * 见 Tables.md 24 节"不要为了每次展示数量都执行昂贵的全表统计"。
 */
export async function listApprovedPosts(
  input: ListApprovedPostsInput
): Promise<ListApprovedPostsResult> {
  const { categoryId, searchQuery, page, pageSize } = input;
  const from = page * pageSize;
  const to = from + pageSize;

  let query = getSupabaseClient()
    .from("posts")
    .select(
      "id, title, price_amount, price_label, currency_code, created_at, favorite_count, location:locations(name), location_text, category:categories(name_zh), author:profiles(display_name), post_images(public_url, sort_order, deleted_at)"
    )
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("sort_order", { foreignTable: "post_images", ascending: true })
    .limit(1, { foreignTable: "post_images" })
    .range(from, to);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (searchQuery) {
    const sanitized = sanitizeSearchTerm(searchQuery);
    if (sanitized) {
      query = query.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
    }
  }

  const { data, error } = await query.overrideTypes<PostFeedRow[]>();

  if (error) {
    throw new AppError(error.message, "POSTS_LIST_FAILED", error);
  }

  const rows = data ?? [];
  const hasNextPage = rows.length > pageSize;
  const pageRows = hasNextPage ? rows.slice(0, pageSize) : rows;

  return {
    posts: pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      priceAmount: row.price_amount,
      priceLabel: row.price_label,
      currencyCode: row.currency_code,
      locationName: resolveLocationName(row.location, row.location_text),
      createdAt: row.created_at,
      categoryName: row.category?.name_zh ?? "未知分类",
      authorDisplayName: row.author?.display_name ?? "未知用户",
      coverImageUrl: resolveCoverImageUrl(row.post_images),
      favoriteCount: row.favorite_count
    })),
    hasNextPage
  };
}

/**
 * 只取某个帖子的 author_id，供 ContactSellerButton 判断"当前登录用户是不是
 * 这个帖子的发布者"用——不是完整的帖子详情查询（那是以后单独的任务），
 * 只选这一列。帖子不存在（或已被删除到查不到）时返回 null，不当成错误抛出，
 * 只有真正的 Supabase 查询失败才包装成 AppError。
 */
export async function getPostAuthorId(postId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "POST_AUTHOR_FETCH_FAILED", error);
  }

  return data?.author_id ?? null;
}

export interface PostDetailImage {
  id: string;
  publicUrl: string | null;
  sortOrder: number;
}

export interface PostDetail {
  id: string;
  status: string;
  title: string;
  description: string;
  priceAmount: number | null;
  priceLabel: string | null;
  currencyCode: string;
  categoryId: string;
  categoryName: string;
  locationId: string | null;
  locationText: string | null;
  locationName: string | null;
  createdAt: string;
  authorDisplayName: string;
  contactMethod: string | null;
  contactValue: string | null;
  images: PostDetailImage[];
}

interface PostDetailImageRow {
  id: string;
  public_url: string | null;
  sort_order: number;
  deleted_at: string | null;
}

interface PostDetailRow {
  id: string;
  status: string;
  title: string;
  description: string;
  price_amount: number | null;
  price_label: string | null;
  currency_code: string;
  category_id: string;
  location_id: string | null;
  location_text: string | null;
  created_at: string;
  contact_method: string | null;
  contact_value: string | null;
  location: { name: string } | null;
  category: { name_zh: string } | null;
  author: { display_name: string } | null;
  post_images: PostDetailImageRow[] | null;
}

/**
 * 帖子详情页用：跟 listApprovedPosts（首页/分类页公开列表）故意不共用同一个
 * 查询——那边只需要一条封面图，这里需要帖子的完整字段和全部图片。
 *
 * 这里刻意不加 `.eq("status", "approved")`：可见性完全交给
 * posts_select_public_or_own_or_admin 这条 RLS 策略去决定（游客只能看
 * approved 的，作者本人能看自己任何状态的帖子，管理员能看全部），详情页
 * 不需要在应用层再重复一遍这个判断逻辑——同一个查询对游客/作者本人/管理员
 * 三种身份天然返回各自应该看到的结果。
 *
 * 用 `.maybeSingle()` 而不是 `.single()`：帖子不存在，或者存在但当前登录
 * 身份看不到（被 RLS 过滤掉），这两种情况在这一层是无法区分、也不应该区分
 * 的（区分开来会向未授权的访问者泄露"这个 ID 存在，只是审核没通过"这种
 * 信息），所以统一返回 null，交给页面渲染同一条"帖子未找到"文案，不抛错。
 * 只有真正的 Supabase 查询失败（网络错误等）才包装成 AppError。
 *
 * post_images 内嵌 select 拿不到只作用于内嵌表的软删除过滤（跟
 * listApprovedPosts 里 resolveCoverImageUrl 那段注释是同一个 supabase-js
 * 限制），所以这里也是多选出 deleted_at 这一列，在 JS 里把软删除的图片
 * 过滤掉，而不是展示出来。
 *
 * category_id / location_id / location_text / status 这几个原始值是
 * "我的发布"编辑表单回填用的（下拉框要按 ID 选中对应选项，location_text
 * 是"其他"手动填的地区名，status 是 updatePost() 判断"原来是不是
 * approved、要不要顺带转回 pending"用的入参；联表查出来的
 * category_name_zh/location_name 展示名对回填没用）——只读详情页不需要
 * 这几个字段，但没必要为了这一个只读页面单独拆一份"编辑用查询"，两边
 * 字段大部分重叠，多出的这几列对只读页面没有副作用，加在同一个查询里
 * 更省一次请求。
 */
export async function getPostDetail(postId: string): Promise<PostDetail | null> {
  const { data, error } = await getSupabaseClient()
    .from("posts")
    .select(
      "id, status, title, description, price_amount, price_label, currency_code, category_id, location_id, location_text, created_at, contact_method, contact_value, location:locations(name), category:categories(name_zh), author:profiles(display_name), post_images(id, public_url, sort_order, deleted_at)"
    )
    .eq("id", postId)
    .is("deleted_at", null)
    .order("sort_order", { foreignTable: "post_images", ascending: true })
    .maybeSingle()
    .overrideTypes<PostDetailRow>();

  if (error) {
    throw new AppError(error.message, "POST_DETAIL_FETCH_FAILED", error);
  }

  if (!data) {
    return null;
  }

  const images = (data.post_images ?? [])
    .filter((image) => image.deleted_at === null)
    .map((image) => ({
      id: image.id,
      publicUrl: image.public_url,
      sortOrder: image.sort_order
    }));

  return {
    id: data.id,
    status: data.status,
    title: data.title,
    description: data.description,
    priceAmount: data.price_amount,
    priceLabel: data.price_label,
    currencyCode: data.currency_code,
    categoryId: data.category_id,
    categoryName: data.category?.name_zh ?? "未知分类",
    locationId: data.location_id,
    locationText: data.location_text,
    locationName: resolveLocationName(data.location, data.location_text),
    createdAt: data.created_at,
    authorDisplayName: data.author?.display_name ?? "未知用户",
    contactMethod: data.contact_method,
    contactValue: data.contact_value,
    images
  };
}

export interface AdminPostListItem {
  id: string;
  title: string;
  createdAt: string;
  authorName: string;
  categoryName: string;
  status: string;
}

interface AdminPendingPostRow {
  id: string;
  title: string;
  created_at: string;
  author: { display_name: string } | null;
  category: { name_zh: string } | null;
}

/**
 * 管理员审核队列用：所有 status = 'pending' 且未软删除的帖子，按 created_at
 * 升序排列——审核队列按"等得最久的先处理"排序是有意的选择，不是随手写反了
 * listApprovedPosts 的 descending。
 *
 * 跟公开列表/消息 UI 里刻意不暴露发帖人真实身份（保护普通用户之间的隐私）
 * 不同，这是内部管理后台，管理员审核内容必须知道是谁发的、发在哪个分类下，
 * 一个 UUID 对审核工作没有意义，所以这里用嵌套 select 把 profiles.display_name
 * 和 categories.name_zh 一起带出来（写法跟 listApprovedPosts 的
 * location:locations(name) 一致）。理论上 author_id/category_id 都有外键
 * 约束，关联的 profiles/categories 行不应该缺失，但嵌套 join 万一返回 null
 * 时这里退回一个占位文案，不让页面崩掉。
 */
export async function listPendingPosts(): Promise<AdminPostListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("posts")
    .select(
      "id, title, created_at, author:profiles(display_name), category:categories(name_zh)"
    )
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .overrideTypes<AdminPendingPostRow[]>();

  if (error) {
    throw new AppError(error.message, "ADMIN_PENDING_POSTS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    authorName: row.author?.display_name ?? "未知用户",
    categoryName: row.category?.name_zh ?? "未知分类",
    // 这个查询本身已经用 .eq("status", "pending") 过滤过了，字面量比多选一列
    // status 再从 row 上读一遍更直接；AdminPostListItem 加这个字段主要是为了
    // 给 listAllPosts（混合状态的列表）用，listPendingPosts 这边永远是
    // "pending"，没必要为了这一个已知常量再多查一列。
    status: "pending"
  }));
}

export interface CreatePostInput {
  authorId: string;
  categoryId: string;
  locationId: string | null;
  locationText: string | null;
  title: string;
  description: string;
  priceAmount: number | null;
  contactMethod: string | null;
  contactValue: string | null;
}

export interface CreatePostResult {
  id: string;
}

// Postgres/PostgREST 的 insufficient_privilege 错误码，任何 RLS with check
// 失败都会报这个码——具体为什么这里能把它安全地归因于账号受限，见下面
// createPost 里的注释。
const RLS_VIOLATION_CODE = "42501";
const ACCOUNT_RESTRICTED_MESSAGE =
  "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。";

/**
 * 发布表单提交时用这个方法创建帖子。`status` 在这里硬编码为 'pending'，
 * 不接受调用方传入，防止普通用户绕过审核直接把帖子设为 approved
 * （见 Tables.md 9.8 权限原则："不能把状态直接改为 approved"）。
 */
export async function createPost(input: CreatePostInput): Promise<CreatePostResult> {
  const payload: TablesInsert<"posts"> = {
    author_id: input.authorId,
    category_id: input.categoryId,
    location_id: input.locationId,
    location_text: input.locationText,
    title: input.title,
    description: input.description,
    price_amount: input.priceAmount,
    contact_method: input.contactMethod,
    contact_value: input.contactValue,
    status: "pending"
  };

  const { data, error } = await getSupabaseClient()
    .from("posts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    // posts_insert_own 这条 RLS 策略（见
    // supabase/migrations/20260717000700_account_status_enforcement.sql）的
    // with check 有两个条件：author_id = auth.uid()，以及
    // not is_account_restricted()。42501 是 PostgREST 对"任意 with check
    // 失败"统一返回的错误码，本身分不清是哪个条件失败——但这里的 author_id
    // 只可能来自 authorId 参数，而 createPost 唯一的调用方
    // publish-page.tsx 只会传当前登录用户自己的 session.user.id，不接受
    // 任意/伪造输入，所以 author_id 这个条件对一个正常工作的客户端来说
    // 永远成立。因此对这个调用点而言，42501 只可能是 is_account_restricted()
    // 失败，可以放心地映射成一条专门的、可操作的提示，而不是把原始的
    // "违反行级安全策略"报给用户。
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
    throw new AppError(error.message, "POST_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError("创建帖子后无法读取帖子 ID。", "POST_CREATE_ID_MISSING");
  }

  return { id: data.id };
}

interface AdminAllPostRow {
  id: string;
  title: string;
  created_at: string;
  status: string;
  author: { display_name: string } | null;
  category: { name_zh: string } | null;
}

/**
 * 管理员"全部帖子"管理列表（/admin/posts/all）用：默认返回所有未软删除的
 * 帖子，不限制 status（draft/pending/approved/rejected/archived 都在内），
 * 可选传 statusFilter 再收窄到某一个状态。
 *
 * 按 created_at 降序排列（最新的在前面）——这是刻意跟 listPendingPosts
 * （created_at 升序、"等得最久的先处理"）不同的排序，不是抄错了写反：这里
 * 是一个通用的浏览/管理列表，不是要按顺序处理完就清空的审核队列，管理员
 * 大概率更关心"最近发生了什么"，所以默认最新的在最前面，跟 listApprovedPosts
 * 面向访客的公开列表排序方向一致。
 *
 * 嵌套 select 复用 listPendingPosts 那一套（author:profiles(display_name)、
 * category:categories(name_zh)）：posts 对 profiles 只有 author_id 这一个
 * 外键，对 categories 只有 category_id 这一个外键，跟 reports 表对 profiles
 * 有两个外键（reporter_id / reviewer_id）导致嵌套 select 必须写
 * `profiles!reports_reporter_id_fkey(...)` 消歧的情况不同，这里没有那个坑，
 * 沿用不带外键提示的写法是安全的。
 */
export async function listAllPosts(statusFilter?: string): Promise<AdminPostListItem[]> {
  let query = getSupabaseClient()
    .from("posts")
    .select(
      "id, title, created_at, status, author:profiles(display_name), category:categories(name_zh)"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query.overrideTypes<AdminAllPostRow[]>();

  if (error) {
    throw new AppError(error.message, "ADMIN_ALL_POSTS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    authorName: row.author?.display_name ?? "未知用户",
    categoryName: row.category?.name_zh ?? "未知分类",
    status: row.status
  }));
}

export interface MyPostListItem {
  id: string;
  title: string;
  categoryName: string;
  locationName: string | null;
  coverImageUrl: string | null;
  status: string;
  createdAt: string;
  rejectionReason: string | null;
}

interface MyPostRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
  rejection_reason: string | null;
  location: { name: string } | null;
  location_text: string | null;
  category: { name_zh: string } | null;
  post_images: PostFeedImageRow[] | null;
}

/**
 * "我的发布"管理页用：按 author_id 过滤出当前登录用户自己的帖子，不限制
 * status（draft/pending/approved/rejected/archived 全部要展示，让作者
 * 能在一个页面管理所有状态），只排除已软删除的（deleted_at 不为 null——
 * 作者自己删除过的帖子，删除本身在这个页面上就是终态操作，不需要再让它
 * 出现在列表里）。
 *
 * 可见性完全靠 posts_select_public_or_own_or_admin 这条 RLS 策略保证
 * （作者能读到自己任何状态的帖子），这里加 `.eq("author_id", authorId)`
 * 只是为了不把"当前用户能看到的全部帖子"（游客也能看到的 approved 帖子）
 * 也混进来，不是权限判断本身。
 *
 * 封面图取法（一条 post_images，按 sort_order 排序，JS 里过滤软删除）
 * 直接复用 listApprovedPosts 的 resolveCoverImageUrl，跟那边是同一个
 * supabase-js 嵌套 select 限制。
 *
 * rejection_reason 见
 * supabase/migrations/20260722000000_add_posts_rejection_reason.sql——
 * 只在 status = 'rejected' 时才有意义，但这里不做按状态才选择性查询这一列
 * 的处理，统一带出来，卡片组件自己决定什么时候展示。
 */
export async function listMyPosts(authorId: string): Promise<MyPostListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("posts")
    .select(
      "id, title, status, created_at, rejection_reason, location:locations(name), location_text, category:categories(name_zh), post_images(public_url, sort_order, deleted_at)"
    )
    .eq("author_id", authorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("sort_order", { foreignTable: "post_images", ascending: true })
    .limit(1, { foreignTable: "post_images" })
    .overrideTypes<MyPostRow[]>();

  if (error) {
    throw new AppError(error.message, "MY_POSTS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    categoryName: row.category?.name_zh ?? "未知分类",
    locationName: resolveLocationName(row.location, row.location_text),
    coverImageUrl: resolveCoverImageUrl(row.post_images),
    status: row.status,
    createdAt: row.created_at,
    rejectionReason: row.rejection_reason
  }));
}

// 下面四个方法（updatePost/archivePost/resubmitPost/deleteMyPost）都是
// 作者对自己帖子的自助操作，全部走 posts_update_own_or_admin 这条 RLS
// 策略的作者分支直接 UPDATE，不新建 security definer 函数、不写
// moderation_actions——这是跟用户确认过的方案（管理员那一套 approve_post/
// reject_post/delete_post 走函数+审计日志，是因为那是"对别人内容的裁决"；
// 这四个是"作者对自己内容的自助管理"，两者权限模型不同，不应该共用同一套
// 机制）。
//
// 四个方法都在 .update() 后面接 `.select("id").maybeSingle()`：RLS 的
// `using` 子句只是让不满足条件的行在 UPDATE 的目标集合里"消失"，不会让
// PostgREST 报错——如果 postId 不存在、不属于当前用户、或者已经被软删除，
// `.update()` 本身会静默地影响 0 行、返回成功。只看 `error` 字段判断不出
// "改成功了"和"这一行根本没被选中"的区别，所以额外 select 回 id，
// `data` 是 null 就视为"帖子不存在，或没有权限操作"，包装成明确的 AppError，
// 不让调用方误以为操作成功了。

const MY_POST_NOT_FOUND_MESSAGE = "帖子不存在，或没有权限操作。";

export interface UpdatePostInput {
  postId: string;
  currentStatus: string;
  categoryId: string;
  locationId: string | null;
  locationText: string | null;
  title: string;
  description: string;
  priceAmount: number | null;
  contactMethod: string | null;
  contactValue: string | null;
}

/**
 * 编辑帖子字段用。currentStatus 由调用方传入（编辑表单加载时已经查出来的
 * 当前状态），不在这个函数内部再查一次——理由见 UpdatePostInput 类型上方
 * 这段：这个值只用来决定"要不要顺带把 status 改回 pending"，不是权限判断
 * 依据（RLS 的 with check 才是权限判断依据，这里传错/传旧了 currentStatus
 * 顶多导致"该转 pending 的没转"这种业务逻辑小问题，不会绕过任何权限限制）。
 *
 * status 只有原本是 'approved' 时才会被带进这次 UPDATE、改成 'pending'——
 * 内容变了要重新审核。如果原本是 rejected/archived/draft/pending，这次
 * 编辑不自动改状态，等作者自己手动点"重新提交审核"（resubmitPost）。这跟
 * posts_update_own_or_admin 的 with check（status 不变，或者不等于
 * approved）完全对得上：不传 status 字段时，UPDATE 不触碰这一列，新值
 * 自动等于旧值，天然满足"status 不变"这一支。
 */
export async function updatePost(input: UpdatePostInput): Promise<void> {
  const payload: TablesUpdate<"posts"> = {
    category_id: input.categoryId,
    location_id: input.locationId,
    location_text: input.locationText,
    title: input.title,
    description: input.description,
    price_amount: input.priceAmount,
    contact_method: input.contactMethod,
    contact_value: input.contactValue
  };

  if (input.currentStatus === "approved") {
    payload.status = "pending";
  }

  const { data, error } = await getSupabaseClient()
    .from("posts")
    .update(payload)
    .eq("id", input.postId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "POST_UPDATE_FAILED", error);
  }
  if (!data) {
    throw new AppError(MY_POST_NOT_FOUND_MESSAGE, "POST_UPDATE_NOT_FOUND");
  }
}

/**
 * 下架：status 改成 'archived'，同时把 archived_at 设成当前时间——这一列
 * 从建表到现在从没被任何代码写过（见 Tables.md "下架时间"字段说明），
 * 这次是它第一次被用到。'archived' 不是 posts_update_own_or_admin 作者
 * 分支黑名单挡住的 'approved'，直接 UPDATE 可以通过。
 */
export async function archivePost(postId: string): Promise<void> {
  const payload: TablesUpdate<"posts"> = {
    status: "archived",
    archived_at: new Date().toISOString()
  };

  const { data, error } = await getSupabaseClient()
    .from("posts")
    .update(payload)
    .eq("id", postId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "POST_ARCHIVE_FAILED", error);
  }
  if (!data) {
    throw new AppError(MY_POST_NOT_FOUND_MESSAGE, "POST_ARCHIVE_NOT_FOUND");
  }
}

/**
 * 重新提交审核：status 改回 'pending'，同时把 rejection_reason 清空成
 * null——旧的驳回原因对一条已经重新提交的帖子没有意义了，留着会在下一次
 * 审核完成前展示一条过期信息。清空这一列被
 * posts_update_own_or_admin 作者分支的 with check 显式允许（见
 * supabase/migrations/20260722000000_add_posts_rejection_reason.sql），
 * 但这条策略只放行"改成 null"，不放行"改成任意其它文本"，所以这个函数
 * 不接受调用方传入自定义的 rejection_reason，只能清空，不能捏造。
 */
export async function resubmitPost(postId: string): Promise<void> {
  const payload: TablesUpdate<"posts"> = {
    status: "pending",
    rejection_reason: null
  };

  const { data, error } = await getSupabaseClient()
    .from("posts")
    .update(payload)
    .eq("id", postId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "POST_RESUBMIT_FAILED", error);
  }
  if (!data) {
    throw new AppError(MY_POST_NOT_FOUND_MESSAGE, "POST_RESUBMIT_NOT_FOUND");
  }
}

/**
 * 作者自己删除自己的帖子（软删除：设置 deleted_at）。故意叫 deleteMyPost
 * 而不是 deletePost——admin-repository.ts 里已经有一个 deletePost，那个是
 * 管理员专用的 delete_post() RPC 封装（内部硬性检查 is_admin()，普通作者
 * 调用会被数据库拒绝），跟这个函数权限模型完全不同，不能共用一个名字，
 * 避免以后有人看名字以为能互相替换调用。
 *
 * 这个操作没有对应的 moderation_actions 记录（那张表的 INSERT 策略是
 * 管理员专用，作者自助删除不属于"管理员审核动作"，见方案讨论）；也没有
 * "删除原因"这个概念——不像管理员删帖需要为审计日志留一个理由，这里只是
 * 一个 Yes/No 确认。
 *
 * posts_update_own_or_admin 的 using 子句要求 `deleted_at is null` 才能
 * 选中一行做 UPDATE，所以这个操作天然不可逆：一旦 deleted_at 被设置，
 * 作者自己也无法再通过这条策略选中这一行做任何后续更新（包括恢复），不需要
 * 额外代码去保证"删除是终态"。
 */
export async function deleteMyPost(postId: string): Promise<void> {
  const payload: TablesUpdate<"posts"> = {
    deleted_at: new Date().toISOString()
  };

  const { data, error } = await getSupabaseClient()
    .from("posts")
    .update(payload)
    .eq("id", postId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "MY_POST_DELETE_FAILED", error);
  }
  if (!data) {
    throw new AppError(MY_POST_NOT_FOUND_MESSAGE, "MY_POST_DELETE_NOT_FOUND");
  }
}

import type { Comment } from "../repositories/comments-repository";

export interface CommentNode extends Comment {
  children: CommentNode[];
}

/**
 * 把 repository 返回的扁平评论数组（listPostComments 已经按 created_at
 * 升序排好）按 parentId 组装成树。一次遍历 + Map 建索引，不是每个节点都
 * 现场 find 一遍父节点那种 O(n²) 写法：
 * 1. 第一轮遍历：给每条评论包一层 { ...comment, children: [] }，存进以
 *    id 为 key 的 Map，方便第二轮 O(1) 查到任意节点。
 * 2. 第二轮遍历：parentId 为 null 的直接进顶层数组；parentId 非 null 的，
 *    去 Map 里找父节点，找到了就 push 进父节点的 children。
 *
 * 理论上不应该发生、但防御性处理一下：parentId 指向的评论不在传入的数组
 * 里（RLS 已经保证 parent_id 必须指向同一帖子下的已有评论，正常情况下
 * 不会出现这种孤儿数据）——直接把这个节点当成顶层节点处理，不因为找不到
 * 父节点就让整个函数抛错，一整棵评论树不应该因为一条异常数据整体渲染
 * 失败。
 *
 * 同一层级内保持原数组的相对顺序（listPostComments 已经按 created_at
 * 升序查出来了，这里两轮遍历都是顺序遍历、顺序 push，不会打乱）。
 */
export function buildCommentTree(comments: Comment[]): CommentNode[] {
  const nodesById = new Map<string, CommentNode>();
  for (const comment of comments) {
    nodesById.set(comment.id, { ...comment, children: [] });
  }

  const roots: CommentNode[] = [];
  for (const comment of comments) {
    const node = nodesById.get(comment.id);
    if (!node) continue;

    if (comment.parentId === null) {
      roots.push(node);
      continue;
    }

    const parent = nodesById.get(comment.parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      // 孤儿节点：父节点不在这批数据里，当成顶层节点，不抛错。
      roots.push(node);
    }
  }

  return roots;
}

export type CommentSortMode = "latest" | "hot";

/**
 * 社区帖子详情页改版任务卡：评论区"最新/最热"切换，只排顶层评论，每条
 * 评论自己的 children（楼中楼）保持 buildCommentTree 给出的原顺序
 * （created_at 升序，也就是聊天式的"从旧到新"），不会把回复挪到别的
 * 评论下面。不修改入参，返回新数组。
 *
 * - latest：顶层评论按 createdAt 倒序（最新的在最前）。注意这跟
 *   buildCommentTree/listComments 的原始顺序（created_at 升序，最旧的在
 *   最前）是相反的——"最新"这个标签只有倒序才名副其实。
 * - hot：评论没有点赞数，"热度"目前只能拿"直接回复数"当近似——按直接
 *   回复数倒序，已删除的回复不计入（一条被删掉的回复不应该给评论加热度）；
 *   回复数相同的评论按"最新"的顺序排（先做倒序再做稳定排序，同分项保持
 *   倒序）。不新增任何数据库字段/查询。
 */
export function sortCommentTree(nodes: CommentNode[], mode: CommentSortMode): CommentNode[] {
  const newestFirst = [...nodes].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
  if (mode === "latest") {
    return newestFirst;
  }
  const replyCount = (node: CommentNode): number =>
    node.children.filter((child) => !child.isDeleted).length;
  return newestFirst.sort((a, b) => replyCount(b) - replyCount(a));
}

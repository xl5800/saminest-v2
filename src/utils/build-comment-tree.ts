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

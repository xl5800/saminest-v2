import { useMutation } from "@tanstack/react-query";

import {
  type UpdateCategoryInput,
  updateCategory
} from "../../repositories/categories-repository";

export interface UpdateCategoryMutationInput {
  id: string;
  input: UpdateCategoryInput;
}

/**
 * 更新分类——编辑表单保存和启用/停用切换共用同一个 mutation（底层就是
 * 同一个 updateCategory 函数），不为"切换启用状态"单独包一个 mutation。
 * 不 invalidateQueries，理由同 use-set-account-status-mutation.ts：调用方
 * 成功后自己更新本地那一行，不需要整份列表重新 fetch。
 */
export function useUpdateCategoryMutation() {
  return useMutation({
    mutationFn: ({ id, input }: UpdateCategoryMutationInput) =>
      updateCategory(id, input)
  });
}

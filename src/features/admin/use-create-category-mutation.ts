import { useMutation } from "@tanstack/react-query";

import {
  type CreateCategoryInput,
  createCategory
} from "../../repositories/categories-repository";

/**
 * 新建分类。不 invalidateQueries——理由同 use-delete-post-mutation.ts，调用方
 * （categories-page.tsx）成功后自己把新分类加进本地列表，不需要整份列表
 * 重新 fetch。
 */
export function useCreateCategoryMutation() {
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => createCategory(input)
  });
}

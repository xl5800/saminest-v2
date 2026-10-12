import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  type AdminUpdateCommunityInput,
  adminApproveCommunity,
  adminArchiveCommunity,
  adminRejectCommunity,
  adminRestoreCommunity,
  adminUpdateCommunity
} from "../../repositories/admin-repository";
import { MY_COMMUNITIES_QUERY_KEY } from "../community/use-my-communities-query";
import { ADMIN_COMMUNITY_REQUESTS_QUERY_KEY } from "./use-admin-community-requests-query";

/**
 * 审核社区申请成功后：刷新管理后台申请列表；通过的社区会出现在公开社区列表里，
 * 所以同时失效 ["communities"]（浏览页 / 搜索页的社区列表）。
 */
function useInvalidateAfterReview() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_COMMUNITY_REQUESTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["communities"] });
  };
}

export function useAdminApproveCommunityMutation() {
  const invalidate = useInvalidateAfterReview();
  return useMutation({
    mutationFn: (communityId: string) => adminApproveCommunity(communityId),
    onSuccess: invalidate
  });
}

export interface AdminRejectCommunityInput {
  communityId: string;
  rejectionNote: string;
}

export function useAdminRejectCommunityMutation() {
  const invalidate = useInvalidateAfterReview();
  return useMutation({
    mutationFn: (input: AdminRejectCommunityInput) =>
      adminRejectCommunity(input.communityId, input.rejectionNote),
    onSuccess: invalidate
  });
}

/**
 * 编辑 / 关闭 / 恢复社区成功后，除了上面审核后要刷新的两类，社区名称/简介/
 * 状态还会出现在：单个社区页（["community", slug]）、我的社区
 * （MY_COMMUNITIES_QUERY_KEY = "my-communities"，见 use-my-communities-query）、
 * 社区帖子流和搜索（["community-posts"]，关闭后这个社区的帖子要从首页消失），
 * 一并失效。
 */
function useInvalidateAfterManage() {
  const queryClient = useQueryClient();
  const invalidateReview = useInvalidateAfterReview();
  return () => {
    invalidateReview();
    void queryClient.invalidateQueries({ queryKey: ["community"] });
    void queryClient.invalidateQueries({ queryKey: [MY_COMMUNITIES_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
  };
}

export function useAdminUpdateCommunityMutation() {
  const invalidate = useInvalidateAfterManage();
  return useMutation({
    mutationFn: (input: AdminUpdateCommunityInput) => adminUpdateCommunity(input),
    onSuccess: invalidate
  });
}

export interface AdminArchiveCommunityInput {
  communityId: string;
  archiveNote: string;
}

export function useAdminArchiveCommunityMutation() {
  const invalidate = useInvalidateAfterManage();
  return useMutation({
    mutationFn: (input: AdminArchiveCommunityInput) =>
      adminArchiveCommunity(input.communityId, input.archiveNote),
    onSuccess: invalidate
  });
}

export function useAdminRestoreCommunityMutation() {
  const invalidate = useInvalidateAfterManage();
  return useMutation({
    mutationFn: (communityId: string) => adminRestoreCommunity(communityId),
    onSuccess: invalidate
  });
}

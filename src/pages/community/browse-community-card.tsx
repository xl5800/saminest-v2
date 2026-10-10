import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { CommunityCard } from "../../components/community-card";
import { LeaveCommunityConfirmDialog } from "../../components/leave-community-confirm-dialog";
import { useCommunityMembershipQuery } from "../../features/community/use-community-membership-query";
import { useCommunityPostsTodayCountQuery } from "../../features/community/use-community-posts-today-count-query";
import { useJoinCommunityMutation } from "../../features/community/use-join-community-mutation";
import { useLeaveCommunityMutation } from "../../features/community/use-leave-community-mutation";
import type { Community } from "../../repositories/community-repository";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";

const JOIN_ERROR_MESSAGE = "加入失败，请稍后重试。";
const LEAVE_ERROR_MESSAGE = "退出失败，请稍后重试。";
// communities.description 是可空列，没有简介的社区卡片上退回一句占位，数据库里
// 填了就自动用数据库的。
const DESCRIPTION_FALLBACK = "暂无简介";

/**
 * 社区浏览页 / 全站搜索页里的单张社区卡片（原来定义在 community-browse-page.tsx
 * 内部，搜索页也要展示社区结果，抽出来两边共用）。每张卡片自己持有"成员状态 /
 * 今日新帖子数 / 加入、退出 mutation / 失败提示"——多个社区同时出现在列表里，这些
 * 状态都是按社区区分的。
 *
 * 加入/退出：已登录调用 joinCommunity / leaveCommunity，成功后由
 * applyCommunityMembershipChange 直接写入最新成员状态并失效相关缓存，按钮立刻在
 * "加入"和"退出"之间切换；点"退出"先弹 LeaveCommunityConfirmDialog 确认，确认后
 * 才真正退出。游客点"加入"跳 /login，跟 favorite-button.tsx 同一个模式。
 */
export function BrowseCommunityCard({ community }: { community: Community }) {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.session)?.user.id;
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  const membership = useCommunityMembershipQuery(community.id, userId);
  const { data: todayPostCount } = useCommunityPostsTodayCountQuery(community.id);
  const joinCommunity = useJoinCommunityMutation();
  const leaveCommunity = useLeaveCommunityMutation();

  const isMember = Boolean(userId) && membership.data === true;
  const joinState = joinCommunity.isPending
    ? "joining"
    : leaveCommunity.isPending
      ? "leaving"
      : isMember
        ? "joined"
        : "join";

  function handleJoin(): void {
    if (!userId) {
      navigate("/login");
      return;
    }
    if (joinCommunity.isPending || leaveCommunity.isPending) return;

    setActionError(null);
    joinCommunity.mutate(
      { communityId: community.id, userId },
      {
        onError: (error) => {
          // 跟 favorite-button.tsx 同一个原则：账号受限是明确、可操作的失败
          // 原因，直接展示；其它未知失败退回通用文案。
          setActionError(
            error instanceof AppError && error.code === "ACCOUNT_RESTRICTED"
              ? error.message
              : JOIN_ERROR_MESSAGE
          );
        }
      }
    );
  }

  function handleLeaveClick(): void {
    if (!userId || joinCommunity.isPending || leaveCommunity.isPending) return;
    setConfirmLeaveOpen(true);
  }

  function handleConfirmLeave(): void {
    setConfirmLeaveOpen(false);
    if (!userId || joinCommunity.isPending || leaveCommunity.isPending) return;

    setActionError(null);
    leaveCommunity.mutate(
      { communityId: community.id, userId },
      { onError: () => setActionError(LEAVE_ERROR_MESSAGE) }
    );
  }

  return (
    <div>
      <CommunityCard
        name={community.name}
        memberCount={community.memberCount}
        todayPostCount={todayPostCount}
        description={community.description ?? DESCRIPTION_FALLBACK}
        to={`/community/${community.slug}`}
        joinState={joinState}
        onJoin={handleJoin}
        onLeave={handleLeaveClick}
        isOfficial={community.isOfficial}
      />
      {actionError ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {actionError}
        </p>
      ) : null}
      {confirmLeaveOpen ? (
        <LeaveCommunityConfirmDialog
          communityName={community.name}
          onCancel={() => setConfirmLeaveOpen(false)}
          onConfirm={handleConfirmLeave}
        />
      ) : null}
    </div>
  );
}

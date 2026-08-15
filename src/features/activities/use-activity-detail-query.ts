import { useQuery } from "@tanstack/react-query";

import {
  getActivityDetail,
  type ActivityDetail
} from "../../repositories/activities-repository";

/**
 * 活动详情页用：直接把 getActivityDetail 包一层 useQuery，不在这里加任何
 * 额外的数据变换——字段映射/可见性判断都已经在 repository 层做完了，跟
 * use-post-detail-query.ts 是同一个模式。
 *
 * data 为 null 表示活动不存在，或者当前登录身份看不到它（被 RLS 过滤
 * 掉）——页面统一渲染"活动未找到"，不额外判断、不泄露信息。
 */
export function useActivityDetailQuery(activityId: string) {
  return useQuery<ActivityDetail | null>({
    queryKey: ["activity-detail", activityId],
    queryFn: () => getActivityDetail(activityId)
  });
}

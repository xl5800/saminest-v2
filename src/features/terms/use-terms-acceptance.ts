import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { acceptTerms, getMyTermsAcceptedAt } from "../../repositories/profiles-repository";
import { useAuthStore } from "../../store/auth-store";

export const TERMS_ACCEPTANCE_QUERY_KEY = "terms-acceptance";

/** 苹果审核 1.2 整改：当前登录用户有没有同意过用户协议。没登录时不查。 */
export function useTermsAcceptanceQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<string | null>({
    queryKey: [TERMS_ACCEPTANCE_QUERY_KEY, userId],
    queryFn: () => getMyTermsAcceptedAt(userId as string),
    enabled: !!userId
  });
}

export function useAcceptTermsMutation() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useMutation({
    mutationFn: acceptTerms,
    onSuccess: (acceptedAt) => {
      queryClient.setQueryData([TERMS_ACCEPTANCE_QUERY_KEY, userId], acceptedAt);
    }
  });
}

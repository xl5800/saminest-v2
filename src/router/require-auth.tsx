import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";

import { useAuthStore } from "../store/auth-store";

export function RequireAuth({
  children
}: {
  children: ReactElement;
}): ReactElement {
  const session = useAuthStore((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

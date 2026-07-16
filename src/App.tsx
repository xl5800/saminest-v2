import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { queryClient } from "./app/query-client";
import { useAuthBootstrap } from "./app/use-auth-bootstrap";
import { router } from "./router/routes";
import { useAuthStore } from "./store/auth-store";

export function App() {
  useAuthBootstrap();
  const isInitializing = useAuthStore((s) => s.isInitializing);

  return (
    <QueryClientProvider client={queryClient}>
      {isInitializing ? (
        <div role="status">正在加载...</div>
      ) : (
        <RouterProvider router={router} />
      )}
    </QueryClientProvider>
  );
}

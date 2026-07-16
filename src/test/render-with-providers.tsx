import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * 测试用渲染帮手：任何用到 useQuery/useNavigate/Link 的组件测试都需要
 * 一个 QueryClientProvider + Router 上下文，这里统一提供，避免每个测试
 * 文件各写一份几乎一样的包装。
 *
 * 用一个真正的 <Route> 包一层（默认通配 "*"），不是把组件直接塞进
 * MemoryRouter——否则组件里的 useParams() 拿不到参数（比如 CategoryPage
 * 依赖的 :slug）。需要路由参数的测试传 route，例如 "/category/:slug"。
 */
export function renderWithProviders(
  ui: ReactElement,
  options: { initialEntries?: string[]; route?: string } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={options.initialEntries}>
        <Routes>
          <Route path={options.route ?? "*"} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
